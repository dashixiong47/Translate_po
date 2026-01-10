<template>
  <div class="h-screen p-4">
    <el-card style="width: 100%; height: 100%" :body-style="{ height: '89%' }">
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
        <div class="w-full flex items-center justify-end pb-[20px] flex-wrap gap-2">
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
            :disabled="!select.length || selectTranslating"
            :loading="selectTranslating"
            @click="translateSelected"
            type="primary"
            v-tooltip="select.length ? `翻译选中的 ${select.length} 项` : '请先在表格中选择要翻译的项'"
          >
            <el-icon v-if="!selectTranslating"><Select /></el-icon>
            翻译选中项 {{ select.length ? `(${select.length})` : '' }}
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
        <div v-if="tableData.length" class="mb-4 flex items-center gap-4 text-sm">
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
        <div v-if="translationProgress.total > 0" class="mb-4">
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
        >
          <el-tab-pane
            v-for="item in allTranslations"
            :key="item.fileName"
            :label="item.fileName"
            :name="item.fileName"
          >
          </el-tab-pane>
        </el-tabs>
        <Table
          height="88%"
          :columns="columns"
          :table-data="tableData"
          :rowSelection="{ onChange: OnSelect }"
        >
          <template #msgid="{ row, $index }">
            <pre 
              class="whitespace-pre-wrap break-words"
              v-tooltip="'原文内容'"
            >{{ row.msgid }}</pre>
          </template>
          <template #msgstr="{ row, $index }">
            <el-input
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 10 }"
              @input="(value) => statusChange(value, row)"
              :model-value="
                changeMsgstr[tabsValue] &&
                changeMsgstr[tabsValue].hasOwnProperty(row.context)
                  ? changeMsgstr[tabsValue][row.context]
                  : row.msgstr
              "
              placeholder="请输入翻译后的内容"
              v-tooltip="'翻译后的内容,可以手动编辑修改'"
            ></el-input>
          </template>
          <template #status="{ row }">
            <el-tag 
              :type="getState(row.context).type" 
              size="small"
              v-tooltip="getStateTooltip(row.context)"
            >
              {{ getState(row.context).text }}
            </el-tag>
          </template>
          <template #action="{ row, $index }">
            <el-button
              :loading="translating[row.context]"
              @click="translation(row)"
              type="primary"
              size="small"
              v-tooltip="translating[row.context] ? '翻译进行中,请稍候...' : '点击翻译此条目'"
            >
              {{ translating[row.context] ? '翻译中...' : '翻译' }}
            </el-button>
          </template>
        </Table>
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
import { ref, computed, watch } from "vue";
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
const select = ref([]);
const columns = ref([
  {
    prop: "msgid",
    label: "原文",
    slot: "msgid",
    width: 300,
  },
  {
    prop: "msgstr",
    label: "翻译后的内容",
    slot: "msgstr",
  },
  {
    prop: "status",
    label: "状态",
    slot: "status",
    width: 100,
  },
  {
    prop: "action",
    label: "操作",
    slot: "action",
    width: 120,
  },
]);

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

// 翻译进度
const translationProgress = ref({
  total: 0,
  translated: 0,
  failed: 0,
  percentage: 0,
  status: ''
});

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

// 获取状态提示信息
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
});

// 保存配置到本地存储
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
  allTranslations.value = allTranslations.value.concat(
    response.allTranslations
  );
  if (tabsValue.value === "") {
    tabsValue.value = response.allTranslations[0].fileName;
    tableData.value = response.allTranslations[0].translations;
  }
  ElMessage.success(`成功导入 ${response.allTranslations.length} 个文件`);
};

const changeTab = (item) => {
  tabsValue.value = item.paneName;
  const index = allTranslations.value.findIndex(t => t.fileName === item.paneName);
  if (index !== -1) {
    tableData.value = allTranslations.value[index].translations;
  }
};

const removeTab = (item) => {
  allTranslations.value = allTranslations.value.filter(
    (translation) => translation.fileName !== item
  );
  fileList.value = fileList.value.filter((file) => file.name !== item);

  // 清理该tab的翻译数据
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

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的翻译函数
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
    const matches = input.match(regex);

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
    
    // 更新进度
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
    
    // 重试逻辑
    if (retryCount < settings.value.maxRetries) {
      console.log(`重试第 ${retryCount + 1} 次...`);
      await sleep(settings.value.retryDelay);
      return translation(row, retryCount + 1);
    }
    
    // 达到最大重试次数后标记为失败
    rows.forEach((item) => {
      translating.value[item.context] = false;
      failTranslating.value[item.context] = true;
      if (changeMsgstr.value[tabsValue.value]?.[item.context]) {
        delete changeMsgstr.value[tabsValue.value][item.context];
      }
    });
    
    // 更新失败计数
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

// 翻译选中项
const translateSelected = async () => {
  if (select.value.length === 0) {
    ElMessage.warning('请先选择要翻译的项');
    return;
  }

  selectTranslating.value = true;
  await translation(select.value);
  selectTranslating.value = false;
};

// 重试失败的翻译
const retryFailedTranslations = async () => {
  const failedContexts = Object.keys(failTranslating.value);
  if (failedContexts.length === 0) {
    ElMessage.warning('没有失败的翻译项');
    return;
  }

  retryingFailed.value = true;
  
  // 找到所有失败的行
  const failedRows = tableData.value.filter(row => 
    failedContexts.includes(row.context)
  );

  // 清除失败标记
  failTranslating.value = {};

  ElNotification({
    title: '开始重试',
    message: `正在重试 ${failedRows.length} 个失败项...`,
    type: 'info'
  });

  // 初始化进度
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
        translation(rows);
      }
      rows = [row];
      currentSize = row.msgid.length;
    }
  }

  if (rows.length > 0) {
    if (isSync.value) {
      await translation(rows);
    } else {
      translation(rows);
    }
  }

  // 等待异步翻译完成
  if (!isSync.value) {
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

// 自动翻译
// forceRetranslate: 是否强制重新翻译所有项(包括已翻译的)
const autoTranslation = async (forceRetranslate = false) => {
  if (autoTranslating.value) return;
  
  autoTranslating.value = true;
  let currentSize = 0;
  let rows = [];
  
  // 如果是强制重新翻译,清除已有的翻译和失败记录
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
    
    // 清除当前tab的翻译数据
    if (changeMsgstr.value[tabsValue.value]) {
      changeMsgstr.value[tabsValue.value] = {};
    }
    failTranslating.value = {};
    
    // 清除缓存(可选)
    cache = {};
  } else {
    // 只清除失败记录
    failTranslating.value = {};
  }

  // 统计需要翻译的项
  const needTranslation = tableData.value.filter(row => {
    if (forceRetranslate) {
      return true; // 强制重新翻译所有项
    }
    // 只翻译未翻译的项
    return !(changeMsgstr.value[tabsValue.value] && changeMsgstr.value[tabsValue.value][row.context]);
  });

  if (needTranslation.length === 0) {
    ElMessage.warning('所有项目已翻译完成');
    autoTranslating.value = false;
    return;
  }

  // 初始化进度
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
    
    // 根据模式决定是否跳过
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
        translation(rows);
      }
      rows = [row];
      currentSize = row.msgid.length;
    }
  }

  if (rows.length > 0) {
    if (isSync.value) {
      await translation(rows);
    } else {
      translation(rows);
    }
  }

  // 等待异步翻译完成
  if (!isSync.value) {
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

const OnSelect = (selection) => {
  select.value = selection;
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
.el-progress {
  padding: 0 20px;
}

pre {
  font-family: inherit;
  margin: 0;
}

/* 为所有可点击元素添加指针样式 */
button,
.el-select,
.el-input-number,
.el-switch,
.el-tag,
.el-statistic {
  cursor: pointer;
}
</style>