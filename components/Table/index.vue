<template>
  <el-table
    v-loading="loading"
    :data="tableData"
    v-bind="$attrs"
    @selection-change="rowSelection?.onChange"
    style="width: 100%"
    border
  >
    <el-table-column v-if="rowSelection" type="selection" width="55" />
    <template v-for="(item, index) in columns">
      <el-table-column
        v-if="item"
        v-bind="item"
      >
        <template #default="scopes" v-if="item.slot || item.customRender">
          <slot
            :name="item.prop"
            :record="scopes.row"
            :index="scopes.$index"
            v-bind="scopes"
            v-if="item.slot"
          ></slot>

          <RenderTest
            v-else
            :render="
              item.customRender(
                scopes.row != undefined ? scopes.row[item.prop] : scopes.row,
                scopes.row
              )
            "
          ></RenderTest>
        </template>
      </el-table-column>
    </template>
  </el-table>
  <div class="right" v-if="pagination">
    <el-pagination
      v-model:current-page="pagination.pageNo"
      v-model:page-size="pagination.pageSize"
      :page-sizes="[10, 20, 30, 40]"
      layout="total, sizes, prev, pager, next, jumper"
      :total="pagination.total"
      @size-change="handleSizeChange"
      @current-change="handleSizeChange"
    />
  </div>
</template>

<script lang="ts" setup>
import { defineComponent } from "vue";
const RenderTest = defineComponent({
  name: "RenderTest",
  props: {
    render: {
      type: Object,
    },
  },
  render() {
    // 参数1：元素名字符串； 参数2：元素属性； 元素子节点，支持createVNode嵌套
    return this.render;
  },
});
defineProps<{
  columns: any[];
  tableData: any[];
  rowSelection: any;
  pagination: any;
  loading: boolean;
}>();

const emits = defineEmits(["toUpdate"]);
const handleSizeChange = (num: number) => {
  emits("toUpdate");
};
</script>
<style scoped lang="less">
.right {
  width: 100%;
  display: flex;
  justify-content: end;
  margin-top: 20px;
}
</style>
