const contract = JSON.stringify({
  thesis: "项目管理是 Linear 式产品工作区，不是大标题、卡片墙或报表台账。",
  ownWorld: "上下文侧栏、48px 工具栏、紧凑列表、低对比选中态、小面积紫色与右侧属性面板。",
  story: "从侧栏切换项目视图，在中心列表定位工作区，再从项目导航进入仓库与设置。",
  firstViewport: "左侧上下文导航、顶部路径工具栏、中心项目列表或项目内容、右侧属性面板。",
  form: "Linear workspace chrome; seed linear-workspace-pc-v1; PC-only.",
});

/** 生产 DOM 内可审计的 Impeccable surface direction contract。 */
export function ProjectWorkspaceDesignContract() {
  return (
    <script
      type="application/json"
      data-impeccable-contract="linear-workspace-pc-v1"
      dangerouslySetInnerHTML={{ __html: contract }}
    />
  );
}
