<template>
  <div class="h-screen p-4">
    <el-card class="translation-card">
      <template #header>
        <div class="flex items-center justify-between">
          <el-button 
            @click="dialogVisible = true"
            v-tooltip="'导入 .po 格式的翻译文件'"
          >
            导入PO文件<el-icon class="el-icon--right"><Upload /></el-icon>
          </el-button>
          <div class="text-sm text-gray-600">
            <el-tag type="info" size="small">提示</el-tag>
            服务器在国外访问DeepSeek可能会失败,可以多试几次 "一键自动翻译"
          </div>
          <el-button 
            @click="settingVisible = true" 
            type="primary"
            v-tooltip="'配置 API Key、模型和重试参数'"
          >
            设置
          </el-button>
        </div>
      </template>
      <template #default>
        <div class="card-content">
          <div class="toolbar">
            <el-button 
              class="mr-[10px]" 
              type="danger" 
              @click="reset"
              v-tooltip="'清除所有翻译结果和缓存'"
            >
              <el-icon><Refresh /></el-icon> 还原
            </el-button>
            
            <!-- 语言选择下拉框 -->
            <el-select
              v-model="targetLanguage"
              class="mr-[10px]"
              @change="clearCache"
              style="width: 150px"
              placeholder="选择目标语言"
              filterable
              v-tooltip="'选择要翻译到的目标语言'"
            >
              <el-option
                v-for="item in commonLanguages"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              >
                <span>{{ item.flag }} {{ item.label }}</span>
              </el-option>
            </el-select>

            <!-- 批量大小控制 -->
            <el-input-number
              v-model="size"
              :min="100"
              :max="5000"
              :step="100"
              class="mr-[10px]"
              v-tooltip="'每次翻译的字符数限制,影响API调用频率'"
            />

            <el-switch
              class="mr-[10px]"
              v-model="isSync"
              size="large"
              inline-prompt
              active-text="同步"
              inactive-text="异步"
              v-tooltip="'同步模式会等待每批翻译完成后再继续,异步模式会同时发起多个翻译请求'"
            />
            
            <el-button
              :disabled="autoTranslating || !tableData.length"
              @click="autoTranslation(false)"
              :loading="autoTranslating"
              type="success"
              v-tooltip="'自动翻译所有未翻译的项,已翻译的项会被跳过'"
            >
              <el-icon v-if="!autoTranslating"><Promotion /></el-icon>
              {{ autoTranslating ? '翻译中...' : '一键自动翻译' }}
            </el-button>
            
            <!-- 重新全部翻译按钮 -->
            <el-button
              :disabled="autoTranslating || !tableData.length"
              @click="autoTranslation(true)"
              :loading="autoTranslating"
              type="warning"
              v-tooltip="'清除所有已有翻译,从头开始重新翻译全部内容'"
            >
              <el-icon v-if="!autoTranslating"><RefreshRight /></el-icon>
              {{ autoTranslating ? '翻译中...' : '重新全部翻译' }}
            </el-button>
            
            <!-- 重新翻译失败项按钮 -->
            <el-button
              v-if="failedCount > 0"
              :disabled="autoTranslating"
              @click="retryFailedTranslations"
              :loading="retryingFailed"
              type="danger"
              v-tooltip="`重新翻译之前失败的 ${failedCount} 项内容`"
            >
              <el-icon v-if="!retryingFailed"><Warning /></el-icon>
              重试失败项 ({{ failedCount }})
            </el-button>

            <el-button
              :disabled="!selectedRows.length || selectTranslating"
              :loading="selectTranslating"
              @click="translateSelected"
              type="primary"
              v-tooltip="selectedRows.length ? `翻译选中的 ${selectedRows.length} 项` : '请先在表格中选择要翻译的项'"
            >
              <el-icon v-if="!selectTranslating"><Select /></el-icon>
              翻译选中项 {{ selectedRows.length ? `(${selectedRows.length})` : '' }}
            </el-button>
            
            <el-button 
              @click="exportPo" 
              type="success"
              :disabled="!translatedCount"
              v-tooltip="translatedCount ? `导出当前页面的 ${translatedCount} 条翻译结果` : '当前页面没有可导出的翻译内容'"
            >
              导出翻译<el-icon class="el-icon--right"><Download /></el-icon>
            </el-button>
          </div>

          <!-- 翻译统计信息 -->
          <div v-if="tableData.length" class="statistics">
            <el-statistic 
              title="总数" 
              :value="tableData.length"
              v-tooltip="'当前页面的总条目数'"
            />
            <el-statistic 
              title="已翻译" 
              :value="translatedCount" 
              :value-style="{ color: '#67C23A' }"
              v-tooltip="'已成功翻译的条目数'"
            />
            <el-statistic 
              title="未翻译" 
              :value="untranslatedCount" 
              :value-style="{ color: '#E6A23C' }"
              v-tooltip="'还未开始翻译的条目数'"
            />
            <el-statistic 
              title="失败" 
              :value="failedCount" 
              :value-style="{ color: '#F56C6C' }"
              v-tooltip="'翻译失败的条目数,可以点击重试'"
            />
            <el-statistic 
              title="翻译中" 
              :value="translatingCount" 
              :value-style="{ color: '#409EFF' }"
              v-tooltip="'正在进行翻译的条目数'"
            />
          </div>

          <!-- 翻译进度提示 -->
          <div v-if="translationProgress.total > 0" class="progress-bar">
            <el-progress 
              :percentage="translationProgress.percentage" 
              :status="translationProgress.status"
              v-tooltip="`翻译进度: ${translationProgress.translated}/${translationProgress.total}`"
            >
              <span class="text-sm">
                {{ translationProgress.translated }} / {{ translationProgress.total }}
                <span v-if="translationProgress.failed > 0" class="text-red-500">
                  (失败: {{ translationProgress.failed }})
                </span>
              </span>
            </el-progress>
          </div>

          <el-tabs
            v-if="allTranslations.length"
            @tab-click="changeTab"
            v-model="tabsValue"
            type="card"
            closable
            @tab-remove="removeTab"
            class="file-tabs"
          >
            <el-tab-pane
              v-for="item in allTranslations"
              :key="item.fileName"
              :label="item.fileName"
              :name="item.fileName"
            >
            </el-tab-pane>
          </el-tabs>

          <!-- 虚拟滚动表格 -->
          <div class="virtual-table-container">
            <!-- 表头 -->
            <div class="table-header">
              <div class="header-cell" style="width: 50px; flex-shrink: 0;">
                <el-checkbox 
                  v-model="selectAll" 
                  @change="handleSelectAll"
                  v-tooltip="'全选/取消全选'"
                />
              </div>
              <div class="header-cell" style="width: 300px; flex-shrink: 0;">原文</div>
              <div class="header-cell" style="flex: 1;">翻译后的内容</div>
              <div class="header-cell" style="width: 100px; flex-shrink: 0;">状态</div>
              <div class="header-cell" style="width: 120px; flex-shrink: 0;">操作</div>
            </div>

            <!-- 虚拟滚动内容 -->
            <div 
              class="table-body" 
              ref="scrollContainer"
              @scroll="handleScroll"
            >
              <div 
                class="table-content" 
                :style="{ height: `${totalHeight}px`, position: 'relative' }"
              >
                <div
                  v-for="item in visibleItems"
                  :key="item.context"
                  class="table-row"
                  :class="{ 'row-selected': isRowSelected(item.row) }"
                  :style="{ 
                    transform: `translateY(${item.top}px)`,
                    position: 'absolute',
                    width: '100%',
                    height: `${rowHeight}px`
                  }"
                  @click="handleRowClick(item.row, $event)"
                >
                  <!-- 选择框 -->
                  <div class="table-cell" style="width: 50px; flex-shrink: 0;">
                    <el-checkbox 
                      :model-value="isRowSelected(item.row)"
                      @click.stop
                      @change="handleRowSelect(item.row, $event)"
                    />
                  </div>

                  <!-- 原文 -->
                  <div class="table-cell" style="width: 300px; flex-shrink: 0;">
                    <pre 
                      class="cell-content"
                      v-tooltip="'原文内容'"
                    >{{ item.row.msgid }}</pre>
                  </div>

                  <!-- 翻译内容 -->
                  <div class="table-cell" style="flex: 1;">
                    <el-input
                      type="textarea"
                      :autosize="{ minRows: 1, maxRows: 3 }"
                      @input="(value) => statusChange(value, item.row)"
                      @click.stop
                      :model-value="getTranslation(item.row)"
                      placeholder="请输入翻译后的内容"
                      v-tooltip="'翻译后的内容,可以手动编辑修改'"
                    ></el-input>
                  </div>

                  <!-- 状态 -->
                  <div class="table-cell" style="width: 100px; flex-shrink: 0;">
                    <el-tag 
                      :type="getState(item.row.context).type" 
                      size="small"
                      v-tooltip="getStateTooltip(item.row.context)"
                    >
                      {{ getState(item.row.context).text }}
                    </el-tag>
                  </div>

                  <!-- 操作 -->
                  <div class="table-cell" style="width: 120px; flex-shrink: 0;">
                    <el-button
                      :loading="translating[item.row.context]"
                      @click.stop="translation(item.row)"
                      type="primary"
                      size="small"
                      v-tooltip="translating[item.row.context] ? '翻译进行中,请稍候...' : '点击翻译此条目'"
                    >
                      {{ translating[item.row.context] ? '翻译中...' : '翻译' }}
                    </el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </el-card>
    
    <!-- 上传文件弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      title="上传文件"
      width="500"
    >
      <el-upload
        drag
        v-model:file-list="fileList"
        :auto-upload="true"
        action="./api/content"
        :on-success="handleSuccess"
        :multiple="true"
        :limit="10"
        accept=".po"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">拖拽上传 或者 <em>点击这里上传</em></div>
        <template #tip>
          <div class="el-upload__tip">支持上传 .po 文件,最多 10 个</div>
        </template>
      </el-upload>
      <template #footer>
        <div class="flex justify-center">
          <el-button 
            type="primary" 
            @click="dialogVisible = false"
            v-tooltip="'关闭上传窗口'"
          >
            完成
          </el-button>
        </div>
      </template>
    </el-dialog>
    
    <!-- 设置弹窗 -->
    <el-dialog
      v-model="settingVisible"
      title="设置"
      width="500"
    >
      <el-form :model="settings" label-width="100px" style="max-width: 600px">
        <el-form-item label="AI服务">
          <el-select 
            v-model="settings.ai" 
            placeholder="请选择AI"
            v-tooltip="'选择使用的AI翻译服务'"
          >
            <el-option
              v-for="item in aiList"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型">
          <el-select 
            v-model="settings.model" 
            placeholder="请选择模型"
            v-tooltip="'选择具体的AI模型,不同模型效果和速度可能不同'"
          >
            <el-option
              v-for="item in aiModel[settings.ai]"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            type="password"
            placeholder="请输入API Key"
            show-password
            v-model="settings.apiKey"
            v-tooltip="'从AI服务提供商获取的API密钥'"
          />
        </el-form-item>
        <el-form-item label="最大重试次数">
          <el-input-number
            v-model="settings.maxRetries"
            :min="1"
            :max="10"
            v-tooltip="'翻译失败时自动重试的最大次数'"
          />
        </el-form-item>
        <el-form-item label="重试延迟">
          <div class="flex items-center gap-2">
            <el-input-number
              v-model="settings.retryDelay"
              :min="500"
              :max="10000"
              :step="500"
              v-tooltip="'每次重试之间的等待时间,单位为毫秒'"
            />
            <span class="text-sm text-gray-500">毫秒</span>
          </div>
        </el-form-item>
        <el-form-item label="并发限制">
          <el-input-number
            v-model="settings.concurrentLimit"
            :min="1"
            :max="10"
            v-tooltip="'同时进行的翻译请求数量,降低此值可以减少卡顿'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-center">
          <el-button 
            type="primary" 
            @click="saveSetting"
            v-tooltip="'保存设置到本地存储'"
          >
            保存设置
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { 
  Upload, 
  UploadFilled, 
  Download, 
  Refresh, 
  RefreshRight,
  Warning,
  Promotion,
  Select
} from "@element-plus/icons-vue";
import { ElNotification, ElMessage, ElMessageBox } from 'element-plus';

// 自定义指令：tooltip
const vTooltip = {
  mounted(el, binding) {
    el.setAttribute('title', binding.value);
    el.style.cursor = 'pointer';
  },
  updated(el, binding) {
    el.setAttribute('title', binding.value);
  }
};

const fileList = ref([]);
const changeMsgstr = ref({});
const selectedRows = ref([]);
const selectAll = ref(false);

// 虚拟滚动相关
const scrollContainer = ref(null);
const rowHeight = 80; // 每行高度
const bufferSize = 5; // 缓冲区大小
const scrollTop = ref(0);
const containerHeight = ref(600);

// 常用语言列表
const commonLanguages = ref([
  { label: "简体中文", value: "Simplified Chinese", flag: "🇨🇳" },
  { label: "繁体中文", value: "Traditional Chinese", flag: "🇹🇼" },
  { label: "英语", value: "English", flag: "🇺🇸" },
  { label: "日语", value: "Japanese", flag: "🇯🇵" },
  { label: "韩语", value: "Korean", flag: "🇰🇷" },
  { label: "法语", value: "French", flag: "🇫🇷" },
  { label: "德语", value: "German", flag: "🇩🇪" },
  { label: "西班牙语", value: "Spanish", flag: "🇪🇸" },
  { label: "葡萄牙语", value: "Portuguese", flag: "🇵🇹" },
  { label: "俄语", value: "Russian", flag: "🇷🇺" },
  { label: "意大利语", value: "Italian", flag: "🇮🇹" },
  { label: "阿拉伯语", value: "Arabic", flag: "🇸🇦" },
  { label: "荷兰语", value: "Dutch", flag: "🇳🇱" },
  { label: "泰语", value: "Thai", flag: "🇹🇭" },
  { label: "越南语", value: "Vietnamese", flag: "🇻🇳" },
  { label: "印尼语", value: "Indonesian", flag: "🇮🇩" },
  { label: "土耳其语", value: "Turkish", flag: "🇹🇷" },
  { label: "波兰语", value: "Polish", flag: "🇵🇱" },
  { label: "印地语", value: "Hindi", flag: "🇮🇳" },
  { label: "马来语", value: "Malay", flag: "🇲🇾" },
]);

const dialogVisible = ref(false);
const settingVisible = ref(false);
const settings = ref({
  ai: "DeepSeek",
  model: "deepseek-chat",
  apiKey: "",
  maxRetries: 3,
  retryDelay: 2000,
  concurrentLimit: 3,
});

const targetLanguage = ref("Simplified Chinese");
const tabsValue = ref("");
const allTranslations = ref([]);
const translating = ref({});
const failTranslating = ref({});
const tableData = ref([]);
const selectTranslating = ref(false);
const retryingFailed = ref(false);
let size = ref(1000);
let isSync = ref(false);
const autoTranslating = ref(false);
let cache = {};

// 并发控制队列
let translationQueue = [];
let activeTranslations = 0;

// 翻译进度
const translationProgress = ref({
  total: 0,
  translated: 0,
  failed: 0,
  percentage: 0,
  status: ''
});

// 虚拟滚动计算
const totalHeight = computed(() => tableData.value.length * rowHeight);

const startIndex = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / rowHeight) - bufferSize);
});

const endIndex = computed(() => {
  const visibleCount = Math.ceil(containerHeight.value / rowHeight);
  return Math.min(
    tableData.value.length,
    startIndex.value + visibleCount + bufferSize * 2
  );
});

const visibleItems = computed(() => {
  const items = [];
  for (let i = startIndex.value; i < endIndex.value; i++) {
    items.push({
      row: tableData.value[i],
      context: tableData.value[i].context,
      top: i * rowHeight
    });
  }
  return items;
});

// 处理滚动
const handleScroll = () => {
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop;
  }
};

// 更新容器高度
const updateContainerHeight = () => {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight;
  }
};

// 计算各种状态的数量
const translatedCount = computed(() => {
  if (!changeMsgstr.value[tabsValue.value]) return 0;
  return Object.keys(changeMsgstr.value[tabsValue.value]).length;
});

const untranslatedCount = computed(() => {
  return tableData.value.length - translatedCount.value - failedCount.value;
});

const failedCount = computed(() => {
  return Object.keys(failTranslating.value).length;
});

const translatingCount = computed(() => {
  return Object.keys(translating.value).filter(key => translating.value[key]).length;
});

const aiList = ref([
  {
    label: "DeepSeek",
    value: "DeepSeek",
  },
]);

const aiModel = ref({
  DeepSeek: [
    {
      label: "deepseek-chat",
      value: "deepseek-chat",
    },
    {
      label: "deepseek-reasoner",
      value: "deepseek-reasoner",
    },
  ],
});

// 点击整行选中
const handleRowClick = (row, event) => {
  // 如果点击的是输入框、按钮等交互元素，不触发行选择
  const target = event.target;
  const isInteractiveElement = 
    target.tagName === 'TEXTAREA' || 
    target.tagName === 'INPUT' || 
    target.tagName === 'BUTTON' ||
    target.closest('.el-button') ||
    target.closest('.el-input') ||
    target.closest('.el-checkbox');
  
  if (isInteractiveElement) {
    return;
  }

  // 切换选中状态
  const isSelected = isRowSelected(row);
  handleRowSelect(row, !isSelected);
};

// 虚拟表格相关方法
const isRowSelected = (row) => {
  return selectedRows.value.some(r => r.context === row.context);
};

const handleRowSelect = (row, checked) => {
  if (checked) {
    if (!isRowSelected(row)) {
      selectedRows.value.push(row);
    }
  } else {
    selectedRows.value = selectedRows.value.filter(r => r.context !== row.context);
  }
  updateSelectAll();
};

const handleSelectAll = (checked) => {
  if (checked) {
    selectedRows.value = [...tableData.value];
  } else {
    selectedRows.value = [];
  }
};

const updateSelectAll = () => {
  selectAll.value = tableData.value.length > 0 && 
                    selectedRows.value.length === tableData.value.length;
};

const getTranslation = (row) => {
  return changeMsgstr.value[tabsValue.value]?.[row.context] || row.msgstr;
};

const getState = (msgid) => {
  if (translating.value[msgid]) {
    return {
      text: "翻译中",
      type: "info",
    };
  } else if (failTranslating.value[msgid]) {
    return {
      text: "失败",
      type: "danger",
    };
  } else if (
    changeMsgstr.value[tabsValue.value] &&
    changeMsgstr.value[tabsValue.value][msgid]
  ) {
    return {
      text: "已完成",
      type: "success",
    };
  } else {
    return {
      text: "待翻译",
      type: "warning",
    };
  }
};

const getStateTooltip = (msgid) => {
  if (translating.value[msgid]) {
    return "正在进行翻译,请稍候...";
  } else if (failTranslating.value[msgid]) {
    return "翻译失败,可以点击重试按钮或单独翻译此项";
  } else if (
    changeMsgstr.value[tabsValue.value] &&
    changeMsgstr.value[tabsValue.value][msgid]
  ) {
    return "翻译已完成,可以手动修改翻译内容";
  } else {
    return "尚未翻译,点击翻译按钮开始翻译";
  }
};

const clearCache = () => {
  ElMessageBox.confirm(
    '清空缓存将删除所有已缓存的翻译结果,确定要继续吗?',
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(() => {
    cache = {};
    ElMessage.success('缓存已清空');
  }).catch(() => {
    ElMessage.info('已取消清空缓存');
  });
};

onMounted(() => {
  const settingsStr = localStorage.getItem("settings");
  if (settingsStr) {
    settings.value = { ...settings.value, ...JSON.parse(settingsStr) };
  }
  
  const savedLanguage = localStorage.getItem("targetLanguage");
  if (savedLanguage) {
    targetLanguage.value = savedLanguage;
  }
  
  const savedSize = localStorage.getItem("batchSize");
  if (savedSize) {
    size.value = parseInt(savedSize);
  }

  // 监听窗口大小变化
  window.addEventListener('resize', updateContainerHeight);
  nextTick(() => {
    updateContainerHeight();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerHeight);
});

watch(targetLanguage, (newVal) => {
  localStorage.setItem("targetLanguage", newVal);
});

watch(size, (newVal) => {
  localStorage.setItem("batchSize", newVal.toString());
});

const reset = () => {
  ElMessageBox.confirm(
    '还原将清除所有翻译结果和缓存,确定要继续吗?',
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(() => {
    cache = {};
    changeMsgstr.value = {};
    failTranslating.value = {};
    selectTranslating.value = false;
    autoTranslating.value = false;
    selectedRows.value = [];
    selectAll.value = false;
    translationProgress.value = {
      total: 0,
      translated: 0,
      failed: 0,
      percentage: 0,
      status: ''
    };
    ElMessage.success('已还原所有数据');
  }).catch(() => {
    ElMessage.info('已取消还原操作');
  });
};

const saveSetting = () => {
  if (!settings.value.apiKey) {
    ElMessage.warning('请输入API Key');
    return;
  }
  settingVisible.value = false;
  localStorage.setItem("settings", JSON.stringify(settings.value));
  ElMessage.success('设置已保存');
};

const handleSuccess = (response, file, fileList) => {
  const processData = () => {
    allTranslations.value = allTranslations.value.concat(
      response.allTranslations
    );
    if (tabsValue.value === "") {
      tabsValue.value = response.allTranslations[0].fileName;
      tableData.value = response.allTranslations[0].translations;
    }
    ElMessage.success(`成功导入 ${response.allTranslations.length} 个文件`);
    
    nextTick(() => {
      updateContainerHeight();
    });
  };

  if (window.requestIdleCallback) {
    window.requestIdleCallback(processData);
  } else {
    setTimeout(processData, 0);
  }
};

const changeTab = (item) => {
  nextTick(() => {
    tabsValue.value = item.paneName;
    const index = allTranslations.value.findIndex(t => t.fileName === item.paneName);
    if (index !== -1) {
      tableData.value = allTranslations.value[index].translations;
      selectedRows.value = [];
      selectAll.value = false;
      scrollTop.value = 0;
      if (scrollContainer.value) {
        scrollContainer.value.scrollTop = 0;
      }
    }
  });
};

const removeTab = (item) => {
  allTranslations.value = allTranslations.value.filter(
    (translation) => translation.fileName !== item
  );
  fileList.value = fileList.value.filter((file) => file.name !== item);

  if (changeMsgstr.value[item]) {
    delete changeMsgstr.value[item];
  }

  if (allTranslations.value.length) {
    tabsValue.value = allTranslations.value[0].fileName;
    tableData.value = allTranslations.value[0].translations;
  } else {
    tabsValue.value = "";
    tableData.value = [];
  }
  selectedRows.value = [];
  selectAll.value = false;
};

const statusChange = (value, row) => {
  if (!changeMsgstr.value[tabsValue.value]) {
    changeMsgstr.value[tabsValue.value] = {};
  }
  if (value === row.msgstr) {
    delete changeMsgstr.value[tabsValue.value][row.context];
  } else {
    changeMsgstr.value[tabsValue.value][row.context] = value;
  }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const processTranslationQueue = async () => {
  while (translationQueue.length > 0 && activeTranslations < settings.value.concurrentLimit) {
    const task = translationQueue.shift();
    activeTranslations++;
    
    task().finally(() => {
      activeTranslations--;
      processTranslationQueue();
    });
  }
};

const translation = async (row, retryCount = 0) => {
  if (settings.value.apiKey === "") {
    ElNotification({
      title: '提示',
      message: '请先设置API Key',
      type: 'warning'
    });
    return;
  }

  let isArray = Array.isArray(row);
  let rows = isArray ? row : [row];

  const outputs = [];
  const placeholdersList = [];
  let cacheKeys = {};
  
  rows.forEach((item) => {
    if (!cacheKeys[item.msgid]) {
      cacheKeys[item.msgid] = [item.context];
    } else {
      cacheKeys[item.msgid].push(item.context);
    }
  });

  let keys = Object.keys(cacheKeys);
  
  keys.forEach((item) => {
    if (cache[item]) {
      cacheKeys[item].forEach((context) => {
        if (!changeMsgstr.value[tabsValue.value]) {
          changeMsgstr.value[tabsValue.value] = {};
        }
        changeMsgstr.value[tabsValue.value][context] = cache[item];
        translating.value[context] = false;
        if (failTranslating.value[context]) {
          delete failTranslating.value[context];
        }
      });
      cacheKeys[item] = null;
      delete cacheKeys[item];
      return;
    }
    
    const input = item;
    const regex = /{([^}]+)}/g;

    const placeholders = [];
    const output = input.replace(regex, (match, p1) => {
      const placeholder = `{{${placeholders.length}}}`;
      placeholders.push(p1);
      return placeholder;
    });

    outputs.push(output);
    placeholdersList.push(placeholders);
    cacheKeys[item].forEach((context) => {
      translating.value[context] = true;
    });
  });

  if (outputs.length === 0) {
    return;
  }

  try {
    const { message, code } = await $fetch("/api/translation", {
      method: "post",
      body: {
        ...settings.value,
        targetLanguage: targetLanguage.value,
        text: outputs,
      },
    });

    if (code !== 200) {
      throw new Error("翻译失败");
    }

    const restoredTranslations = message.map((translatedText, i) => {
      let restoredText = translatedText;
      placeholdersList[i].forEach((placeholderValue, index) => {
        const placeholder = `{{${index}}}`;
        restoredText = restoredText.replace(
          placeholder,
          `{${placeholderValue}}`
        );
      });
      return restoredText;
    });

    keys = Object.keys(cacheKeys);
    keys.forEach((item, index) => {
      cacheKeys[item].forEach((context) => {
        if (!changeMsgstr.value[tabsValue.value]) {
          changeMsgstr.value[tabsValue.value] = {};
        }
        changeMsgstr.value[tabsValue.value][context] = restoredTranslations[index];
        if (translating.value.hasOwnProperty(context)) {
          delete translating.value[context];
        }
        if (failTranslating.value.hasOwnProperty(context)) {
          delete failTranslating.value[context];
        }
      });
      cache[item] = restoredTranslations[index];
    });

    selectTranslating.value = false;
    
    if (translationProgress.value.total > 0) {
      translationProgress.value.translated += rows.length;
      translationProgress.value.percentage = Math.round(
        (translationProgress.value.translated / translationProgress.value.total) * 100
      );
      if (translationProgress.value.translated >= translationProgress.value.total) {
        translationProgress.value.status = translationProgress.value.failed > 0 ? 'warning' : 'success';
      }
    }
    
  } catch (error) {
    console.error('翻译错误:', error);
    
    if (retryCount < settings.value.maxRetries) {
      console.log(`重试第 ${retryCount + 1} 次...`);
      await sleep(settings.value.retryDelay);
      return translation(row, retryCount + 1);
    }
    
    rows.forEach((item) => {
      translating.value[item.context] = false;
      failTranslating.value[item.context] = true;
      if (changeMsgstr.value[tabsValue.value]?.[item.context]) {
        delete changeMsgstr.value[tabsValue.value][item.context];
      }
    });
    
    if (translationProgress.value.total > 0) {
      translationProgress.value.failed += rows.length;
      translationProgress.value.translated += rows.length;
      translationProgress.value.percentage = Math.round(
        (translationProgress.value.translated / translationProgress.value.total) * 100
      );
      translationProgress.value.status = 'exception';
    }
    
    selectTranslating.value = false;
    
    if (!autoTranslating.value) {
      ElNotification({
        title: '翻译失败',
        message: `${rows.length} 项翻译失败,已达到最大重试次数 (${settings.value.maxRetries})`,
        type: 'error',
        duration: 3000
      });
    }
  }
};

const translateSelected = async () => {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要翻译的项');
    return;
  }

  selectTranslating.value = true;
  
  const batchSize = Math.ceil(selectedRows.value.length / settings.value.concurrentLimit);
  for (let i = 0; i < selectedRows.value.length; i += batchSize) {
    const batch = selectedRows.value.slice(i, i + batchSize);
    if (isSync.value) {
      await translation(batch);
    } else {
      translationQueue.push(() => translation(batch));
    }
  }
  
  if (!isSync.value) {
    processTranslationQueue();
  }
  
  selectTranslating.value = false;
};

const retryFailedTranslations = async () => {
  const failedContexts = Object.keys(failTranslating.value);
  if (failedContexts.length === 0) {
    ElMessage.warning('没有失败的翻译项');
    return;
  }

  retryingFailed.value = true;
  
  const failedRows = tableData.value.filter(row => 
    failedContexts.includes(row.context)
  );

  failTranslating.value = {};

  ElNotification({
    title: '开始重试',
    message: `正在重试 ${failedRows.length} 个失败项...`,
    type: 'info'
  });

  translationProgress.value = {
    total: failedRows.length,
    translated: 0,
    failed: 0,
    percentage: 0,
    status: ''
  };

  let currentSize = 0;
  let rows = [];

  for (let index = 0; index < failedRows.length; index++) {
    const row = failedRows[index];
    
    if (currentSize + row.msgid.length < size.value) {
      rows.push(row);
      currentSize += row.msgid.length;
    } else {
      if (isSync.value) {
        await translation(rows);
      } else {
        translationQueue.push(() => translation(rows));
      }
      rows = [row];
      currentSize = row.msgid.length;
    }
  }

  if (rows.length > 0) {
    if (isSync.value) {
      await translation(rows);
    } else {
      translationQueue.push(() => translation(rows));
    }
  }

  if (!isSync.value) {
    processTranslationQueue();
    await sleep(2000);
  }

  retryingFailed.value = false;
  
  ElNotification({
    title: '重试完成',
    message: `成功: ${translationProgress.value.translated - translationProgress.value.failed}, 失败: ${translationProgress.value.failed}`,
    type: translationProgress.value.failed === 0 ? 'success' : 'warning',
    duration: 5000
  });
};

const autoTranslation = async (forceRetranslate = false) => {
  if (autoTranslating.value) return;
  
  autoTranslating.value = true;
  let currentSize = 0;
  let rows = [];
  
  if (forceRetranslate) {
    const result = await ElMessageBox.confirm(
      '这将清除当前页面的所有翻译结果并重新翻译,确定要继续吗?',
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    ).catch(() => {
      autoTranslating.value = false;
      return false;
    });
    
    if (result === false) {
      autoTranslating.value = false;
      return;
    }
    
    if (changeMsgstr.value[tabsValue.value]) {
      changeMsgstr.value[tabsValue.value] = {};
    }
    failTranslating.value = {};
    cache = {};
  } else {
    failTranslating.value = {};
  }

  const needTranslation = tableData.value.filter(row => {
    if (forceRetranslate) {
      return true;
    }
    return !(changeMsgstr.value[tabsValue.value] && changeMsgstr.value[tabsValue.value][row.context]);
  });

  if (needTranslation.length === 0) {
    ElMessage.warning('所有项目已翻译完成');
    autoTranslating.value = false;
    return;
  }

  translationProgress.value = {
    total: needTranslation.length,
    translated: 0,
    failed: 0,
    percentage: 0,
    status: ''
  };

  ElNotification({
    title: forceRetranslate ? '开始重新翻译' : '开始翻译',
    message: `共需翻译 ${needTranslation.length} 项`,
    type: 'info'
  });

  for (let index = 0; index < tableData.value.length; index++) {
    const row = tableData.value[index];
    
    if (!forceRetranslate && 
        changeMsgstr.value[tabsValue.value] && 
        changeMsgstr.value[tabsValue.value][row.context]) {
      continue;
    }

    if (currentSize + row.msgid.length < size.value) {
      rows.push(row);
      currentSize += row.msgid.length;
    } else {
      if (isSync.value) {
        await translation(rows);
      } else {
        translationQueue.push(() => translation(rows));
      }
      rows = [row];
      currentSize = row.msgid.length;
    }
  }

  if (rows.length > 0) {
    if (isSync.value) {
      await translation(rows);
    } else {
      translationQueue.push(() => translation(rows));
    }
  }

  if (!isSync.value) {
    processTranslationQueue();
    await sleep(2000);
  }

  autoTranslating.value = false;
  
  const successCount = translationProgress.value.translated - translationProgress.value.failed;
  ElNotification({
    title: '翻译完成',
    message: `成功: ${successCount}, 失败: ${translationProgress.value.failed}`,
    type: translationProgress.value.failed === 0 ? 'success' : 'warning',
    duration: 5000
  });
};

const exportPo = async () => {
  if (!changeMsgstr.value[tabsValue.value] || 
      Object.keys(changeMsgstr.value[tabsValue.value]).length === 0) {
    ElMessage.warning('当前页面没有翻译内容可导出');
    return;
  }

  try {
    const formData = new FormData();
    const file = fileList.value.find((file) => file.name === tabsValue.value);
    
    if (!file) {
      ElMessage.error('找不到原始文件');
      return;
    }
    
    formData.append("file", file.raw);
    formData.append(
      "translation",
      JSON.stringify(changeMsgstr.value[tabsValue.value] || {})
    );
    
    const data = await $fetch("/api/download", {
      method: "post",
      body: formData,
    });
    
    const blob = new Blob([data], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tabsValue.value.replace('.po', '')}_${targetLanguage.value.replace(/\s+/g, '_')}.po`;
    a.click();
    URL.revokeObjectURL(url);
    
    ElMessage.success('导出成功');
  } catch (error) {
    console.error(error);
    ElMessage.error('导出失败: ' + error.message);
  }
};
</script>

<style scoped>
/* Card 整体布局 - 固定高度，禁止滚动 */
.translation-card {
  width: 100%;
  height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.translation-card :deep(.el-card__body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Card内容区域 */
.card-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

/* 统计信息 */
.statistics {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  flex-shrink: 0;
}

/* 进度条 */
.progress-bar {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.progress-bar .el-progress {
  padding: 0;
}

/* 文件标签页 */
.file-tabs {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.file-tabs :deep(.el-tabs__content) {
  display: none;
}

/* 虚拟表格容器 - 占据剩余空间并可滚动 */
.virtual-table-container {
  flex: 1;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.table-header {
  display: flex;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  font-weight: bold;
  padding: 12px 0;
  flex-shrink: 0;
}

.header-cell {
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #909399;
}

.table-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.table-content {
  width: 100%;
}

.table-row {
  display: flex;
  border-bottom: 1px solid #ebeef5;
  padding: 10px 0;
  transition: background-color 0.2s;
  min-height: 80px;
  align-items: center;
  box-sizing: border-box;
  cursor: pointer;
}

.table-row:hover {
  background-color: #f5f7fa;
}

.row-selected {
  background-color: #ecf5ff;
}

.row-selected:hover {
  background-color: #d9ecff;
}

.table-cell {
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-size: 14px;
}

.cell-content {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
  max-height: 60px;
  overflow-y: auto;
}

/* 滚动条样式 */
.table-body::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.table-body::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 4px;
}

.table-body::-webkit-scrollbar-thumb:hover {
  background: #c0c4cc;
}

.cell-content::-webkit-scrollbar {
  width: 4px;
}

.cell-content::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 2px;
}
</style>
