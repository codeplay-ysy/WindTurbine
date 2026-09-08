import { DEFECT_CLASS_OPTIONS } from '../utils/inspection'

function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

function AlertPanel({ alert }) {
  if (!alert) {
    return <div className="alert-panel idle">等待巡检分析结果。</div>
  }

  return (
    <div className={alert.triggered ? 'alert-panel warning' : 'alert-panel normal'}>
      <div>
        <span className="alert-label">预警状态</span>
        <strong>{alert.level}</strong>
      </div>
      <p>{alert.message}</p>
      {alert.channels?.length ? (
        <div className="alert-channels">
          {alert.channels.map((channel) => <span key={channel}>{channel}</span>)}
        </div>
      ) : null}
    </div>
  )
}

function PreprocessPanel({ preprocessing }) {
  if (!preprocessing) {
    return <div className="process-card">图像预处理信息将在检测后显示。</div>
  }

  return (
    <div className="process-card">
      <span>分辨率处理</span>
      <strong>{preprocessing.action === 'resize' ? '已自适应缩放' : '保持原始尺寸'}</strong>
      <small>
        {preprocessing.original_width}×{preprocessing.original_height} → {preprocessing.processed_width}×{preprocessing.processed_height}
      </small>
    </div>
  )
}

function DetectionTable({ detections = [], onChangeClass, onDelete }) {
  if (!detections.length) {
    return <div className="empty-table">暂无缺陷目标，选择检测记录后将显示检测明细。</div>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>序号</th>
            <th>缺陷类别</th>
            <th>置信度</th>
            <th>风险等级</th>
            <th>坐标框 x1,y1,x2,y2</th>
            <th>人工修正</th>
          </tr>
        </thead>
        <tbody>
          {detections.map((item) => (
            <tr key={item.index}>
              <td>{item.index}</td>
              <td>
                <div className="detection-edit-cell">
                  <span className="tag">{item.class_name}</span>
                  <select value={item.class_name} onChange={(event) => onChangeClass?.(item.index, event.target.value)}>
                    {DEFECT_CLASS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
              </td>
              <td>{(item.confidence * 100).toFixed(2)}%</td>
              <td><span className={`severity severity-${item.severity}`}>{item.severity}</span></td>
              <td>{item.bbox.x1}, {item.bbox.y1}, {item.bbox.x2}, {item.bbox.y2}</td>
              <td>
                <button className="inline-danger-btn" onClick={() => onDelete?.(item.index)}>
                  删除该缺陷
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultPanel({ result, record, onChangeDetectionClass, onDeleteDetection }) {
  const detections = result?.detections ?? []
  const summary = result?.summary

  return (
    <section className="result-dashboard">
      <div className="section-title">
        <div>
          <p className="eyebrow">Inspection Detail</p>
          <h2>{record ? '巡检记录详情' : '巡检分析结果'}</h2>
          {record ? <p className="record-subtitle">{record.filename} · {record.createdAt}</p> : null}
        </div>
        <span className={result?.model_loaded ? 'status online' : 'status'}>
          {result?.model_loaded ? '分析完成' : '等待分析'}
        </span>
      </div>

      <div className="stats-grid">
        <StatCard label="疑似缺陷" value={summary?.defect_count ?? 0} hint="Defect candidates" />
        <StatCard label="分析耗时" value={summary ? `${summary.elapsed_ms} ms` : '--'} hint="Backend processing" />
        <StatCard label="置信度阈值" value={summary ? summary.confidence_threshold : '--'} hint="Confidence" />
        <StatCard label="检测输入尺寸" value={summary ? summary.input_size : '--'} hint="YOLO input" />
      </div>

      <div className="business-grid">
        <AlertPanel alert={result?.alert} />
        <PreprocessPanel preprocessing={result?.preprocessing} />
      </div>

      <DetectionTable detections={detections} onChangeClass={onChangeDetectionClass} onDelete={onDeleteDetection} />
    </section>
  )
}

export default ResultPanel
