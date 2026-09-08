import { calculateStats, getTaskStatus } from './inspection'

export function buildTaskHtmlReport(task) {
  const stats = calculateStats([task])
  const rows = task.records.map((record) => `
    <tr>
      <td>${record.filename}</td>
      <td>${record.createdAt}</td>
      <td>${record.result?.summary?.defect_count ?? 0}</td>
      <td>${record.result?.alert?.level ?? '未知'}</td>
      <td>${record.review?.status ?? '未复核'}</td>
      <td>${record.processingStatus ?? '待处理'}</td>
      <td>${record.review?.comment || '无'}</td>
      <td>${record.maintenanceSuggestion || ''}</td>
    </tr>
  `).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${task.name}-巡检任务报告</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; padding: 32px; color: #172033; }
    h1 { color: #0f4c81; }
    .meta, .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
    .card { padding: 14px; border: 1px solid #d7e3f3; border-radius: 10px; background: #f7fbff; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #d7e3f3; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #eaf4ff; }
  </style>
</head>
<body>
  <h1>风电叶片巡检任务报告</h1>
  <div class="meta">
    <div class="card"><strong>任务名称</strong><br />${task.name}</div>
    <div class="card"><strong>风场</strong><br />${task.windFarm}</div>
    <div class="card"><strong>风机/叶片</strong><br />${task.turbineId} / ${task.bladeId}</div>
    <div class="card"><strong>巡检人员</strong><br />${task.inspector}</div>
    <div class="card"><strong>创建时间</strong><br />${task.createdAt}</div>
    <div class="card"><strong>任务状态</strong><br />${getTaskStatus(task)}</div>
  </div>
  <div class="summary">
    <div class="card"><strong>检测图片数</strong><br />${stats.recordCount}</div>
    <div class="card"><strong>缺陷总数</strong><br />${stats.defectCount}</div>
    <div class="card"><strong>待复核记录</strong><br />${stats.pendingReviews}</div>
  </div>
  <h2>检测记录明细</h2>
  <table>
    <thead><tr><th>文件名</th><th>检测时间</th><th>缺陷数</th><th>预警等级</th><th>复核状态</th><th>处理状态</th><th>复核意见</th><th>维护建议</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8">暂无检测记录</td></tr>'}</tbody>
  </table>
  <h2>操作日志摘要</h2>
  <table>
    <thead><tr><th>时间</th><th>操作人</th><th>操作类型</th><th>对象</th><th>说明</th></tr></thead>
    <tbody>${(task.logs || []).length ? task.logs.slice(0, 10).map((log) => `<tr><td>${log.time}</td><td>${log.actor}</td><td>${log.action}</td><td>${log.target}</td><td>${log.detail || '无'}</td></tr>`).join('') : '<tr><td colspan="5">暂无操作日志</td></tr>'}</tbody>
  </table>
</body>
</html>`
}
