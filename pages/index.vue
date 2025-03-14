<template>
  <div class="h-screen p-4">
    <el-card style="width: 100%; height: 100%" :body-style="{ height: '89%' }">
      <template #header>
        <div class="flex items-center justify-between">
          <el-button @click="dialogVisible = true">
            导入PO文件<el-icon class="el-icon--right"><Upload /></el-icon>
          </el-button>
          <el-button @click="settingVisible = true" type="primary">
            设置
          </el-button>
        </div>
      </template>
      <template #default>
        <div class="w-full flex items-center justify-end pb-[20px]">
          <el-input
            v-model="targetLanguage"
            class="mr-[10px]"
            @change="clearCache"
            style="width: 120px"
            placeholder="目标语言"
          />
          <el-input-number
            class="mr-[10px]"
            v-model="size"
            :min="100"
            :max="5000"
          />
          <el-switch
            class="mr-[10px]"
            v-model="isSync"
            size="large"
            inline-prompt
            active-text="同步"
            inactive-text="异步"
          />
          <el-button
            :disabled="autoTranslating || !tableData.length"
            @click="autoTranslation"
            type="success"
          >
            一键自动翻译
          </el-button>
          <el-button
            :disabled="!select.length || selectTranslating"
            @click="
              () => {
                selectTranslating = true;
                translation(select);
              }
            "
            type="success"
          >
            翻译选中项
          </el-button>
          <el-button @click="exportPo">
            导出当前页的翻译<el-icon class="el-icon--right"
              ><Download
            /></el-icon>
          </el-button>
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
          <template #msgstr="{ row, $index }">
            <el-input
              type="textarea"
              @input="
                (value) => {
                  markChange(value, row);
                }
              "
              :model-value="
                changeMsgstr[tabsValue] &&
                changeMsgstr[tabsValue].hasOwnProperty(row.context)
                  ? changeMsgstr[tabsValue][row.context]
                  : row.msgstr
              "
              placeholder="请输入翻译后的内容"
            ></el-input>
          </template>
          <template #mark="{ row }">
            <el-tag :type="getState(row.context).type" size="mini">
              {{ getState(row.context).text }}
            </el-tag>
          </template>
          <template #action="{ row, $index }">
            <el-button
              :loading="translating[row.context]"
              @click="translation(row)"
              type="primary"
              size="mini"
            >
              翻译
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
      :before-close="handleClose"
    >
      <el-upload
        drag
        v-model:file-list="fileList"
        :auto-upload="true"
        action="./api/content"
        :on-success="handleSuccess"
        :multiple="true"
        :limit="2"
        accept=".po"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">拖拽上传 或者 <em>点击这里上传</em></div>
      </el-upload>
      <template #footer>
        <div class="flex justify-center">
          <el-button type="primary" @click="dialogVisible = false">
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
      :before-close="handleClose"
    >
      <el-form :model="settings" label-width="80px" style="max-width: 600px">
        <el-form-item label="AI">
          <el-select v-model="settings.ai" placeholder="请选择AI">
            <el-option
              v-for="item in aiList"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="settings.model" placeholder="请选择模型">
            <el-option
              v-for="item in aiModel[settings.ai]"
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
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-center">
          <el-button type="primary" @click="saveSetting"> 完成 </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { Upload, UploadFilled, Download } from "@element-plus/icons-vue";
const fileList = ref([]);
const changeMsgstr = ref({});
const select = ref([]);
const columns = ref([
  {
    prop: "msgid",
    label: "原文",
  },
  {
    prop: "msgstr",
    label: "翻译后的内容",
    slot: "msgstr",
  },
  {
    prop: "mark",
    label: "是否修改",
    slot: "mark",
    width: 100,
  },
  {
    prop: "action",
    label: "操作",
    slot: "action",
    width: 150,
  },
]);
const dialogVisible = ref(false);
const settingVisible = ref(false);
const settings = ref({
  ai: "DeepSeek",
  model: "deepseek-chat",
  apiKey: "",
});
const targetLanguage = ref("chinese");
const tabsValue = ref("");
const allTranslations = ref([]);
const translating = ref({});
const failTranslating = ref({});
const tableData = ref([]);
const selectTranslating = ref(false);
let size = ref(1000); // 限制翻译的字符数
let isSync = ref(false); // 添加变量控制是否同步翻译
const autoTranslating = ref(false); // 添加loading变量
let cache = {};

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
      text: "翻译失败",
      type: "danger",
    };
  } else if (
    changeMsgstr.value[tabsValue.value] &&
    changeMsgstr.value[tabsValue.value][msgid]
  ) {
    return {
      text: "已翻译",
      type: "primary",
    };
  } else {
    return {
      text: "未翻译",
      type: "success",
    };
  }
};
const clearCache = () => {
  console.log("clearCache");
  
  cache = {};
};
onMounted(() => {
  const settingsStr = localStorage.getItem("settings");
  if (settingsStr) {
    settings.value = JSON.parse(settingsStr);
  }
});
const saveSetting = () => {
  settingVisible.value = false;
  localStorage.setItem("settings", JSON.stringify(settings.value));
};

const handleSuccess = (response, file, fileList) => {
  allTranslations.value = allTranslations.value.concat(
    response.allTranslations
  );
  // console.log(allTranslations.value);
  if (tabsValue.value === "") {
    tabsValue.value = response.allTranslations[0].fileName;
    tableData.value = response.allTranslations[0].translations;
  }
};
const changeTab = (item) => {
  tabsValue.value = item.paneName;
  tableData.value = allTranslations.value[Number(item.index)].translations;
};
const removeTab = (item) => {
  allTranslations.value = allTranslations.value.filter(
    (translation) => translation.fileName !== item
  );
  fileList.value = fileList.value.filter((file) => file.name !== item);

  if (allTranslations.value.length) {
    tabsValue.value = allTranslations.value[0].fileName;
    tableData.value = allTranslations.value[0].translations;
  } else {
    tabsValue.value = "";
    tableData.value = [];
  }
};
const markChange = (value, row) => {
  if (!changeMsgstr.value[tabsValue.value]) {
    changeMsgstr.value[tabsValue.value] = {};
  }
  if (value === row.msgstr) {
    delete changeMsgstr.value[tabsValue.value][row.context];
  } else {
    changeMsgstr.value[tabsValue.value][row.context] = value;
  }
};

const translation = async (row) => {
  let isArray = Array.isArray(row);
  let rows = isArray ? row : [row]; // 统一转换为数组处理

  // 遍历所有行，提取 msgid 并处理占位符
  const outputs = [];
  const placeholdersList = [];
  // 重复的内容不再请求翻译，直接使用缓存
  let cacheKeys = {};
  rows.forEach((item) => {
    if (!cacheKeys[item.msgid]) {
      cacheKeys[item.msgid] = [item.context];
    } else {
      cacheKeys[item.msgid].push(item.context);
    }
  });
  // 获取对象的所有键
  let keys = Object.keys(cacheKeys);
  keys.forEach((item) => {
    if (cache[item]) {
      cacheKeys[item].forEach((context, index) => {
        if (!changeMsgstr.value[tabsValue.value]) {
          changeMsgstr.value[tabsValue.value] = {};
        }
        changeMsgstr.value[tabsValue.value][context] = cache[item];
        translating.value[context] = false;
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
      const placeholder = `{{${placeholders.length}}}`; // 生成占位符
      placeholders.push(p1);
      return placeholder;
    });

    outputs.push(output);
    placeholdersList.push(placeholders);
    cacheKeys[item].forEach((context, index) => {
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

    // 遍历翻译结果，将占位符替换回原始内容
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
    // 更新翻译结果
    keys.forEach((item, index) => {
      cacheKeys[item].forEach((context) => {
        if (!changeMsgstr.value[tabsValue.value]) {
          changeMsgstr.value[tabsValue.value] = {};
        }
        changeMsgstr.value[tabsValue.value][context] =
          restoredTranslations[index];
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
  } catch (error) {
    keys.forEach((item, index) => {
      cacheKeys[item].forEach((context) => {
        failTranslating.value[context] = true;
        translating.value[context] = true;
      });
    });
    throw error;
  }
};

// 自动翻译
const autoTranslation = async () => {
  autoTranslating.value = true; // 开始加载
  let currentSize = 0;
  let rows = [];
  for (let index = 0; index < tableData.value.length; index++) {
    const row = tableData.value[index];
    if (
      changeMsgstr.value[tabsValue.value] &&
      changeMsgstr.value[tabsValue.value][row.context]
    ) {
      continue;
    }
    if (currentSize + row.msgid.length < size.value) {
      rows.push(row);
      currentSize += row.msgid.length;
      if (index === tableData.value.length - 1) {
        if (isSync.value) {
          await translation(rows);
        } else {
          translation(rows);
        }
      }
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
  autoTranslating.value = false; // 结束加载
};
const OnSelect = (selection) => {
  select.value = selection;
};

const exportPo = async () => {
  try {
    // 发送formdata
    const formData = new FormData();
    const file = fileList.value.find((file) => file.name === tabsValue.value);
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
    a.download = "export_po_file.po";
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.log(error);
  }
};
</script>

<style scoped></style>
