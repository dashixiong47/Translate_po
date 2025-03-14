export default defineNuxtPlugin((nuxtApp) => {
    // 配置 Vue 的全局警告处理函数
    nuxtApp.vueApp.config.warnHandler = (msg, instance, trace) => {
    //   // 忽略 "Invalid prop" 警告
    //   if (msg.includes('Invalid prop')) {
    //     return;
    //   }
  
    //   // 其他警告仍然输出到控制台
    //   console.warn(msg, trace);
    };
  });