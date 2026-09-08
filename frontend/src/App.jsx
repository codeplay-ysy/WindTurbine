import { useEffect, useMemo, useState } from 'react'
import { inferImage } from './api/client'
import { fetchDeviceTopology } from './api/devices'
import ResultPanel from './components/ResultPanel'
import {
  LEGACY_RECORD_KEY,
  LOGIN_KEY,
  TASK_STORAGE_KEY,
  appendTaskLog,
  calculateStats,
  createDefaultTask,
  createLogEntry,
  createRecord,
  fileToDataUrl,
  getTaskStatus,
  loadStoredTasks,
  normalizeTask,
  updateRecordDetections,
} from './utils/inspection'
import { buildTaskHtmlReport } from './utils/report'
import './styles.css'

const features = ['巡检任务管理', 'AI缺陷识别与人工复核', '任务级报告归档']
const adminFeatures = ['用户与角色管理', '系统运行监控', '模型与日志总览']
const roleOptions = ['巡检员', '运维管理员', '系统管理员']

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('123456')
  const [role, setRole] = useState('巡检员')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (password.trim().length < 4) {
      setError('密码至少需要 4 位')
      return
    }
    const user = { username: username.trim(), role, loginAt: new Date().toLocaleString() }
    localStorage.setItem(LOGIN_KEY, JSON.stringify(user))
    sessionStorage.removeItem(LOGIN_KEY)
    setError('')
    onLogin(user)
  }

  return (
    <div className="login-page">
      <form className="login-card panel-glow" onSubmit={handleSubmit}>
        <span className="badge">Wind Inspection Platform</span>
        <h1>风电叶片智能巡检系统</h1>
        <p>支持角色化登录展示与人工复核流程演示。</p>
        <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入用户名" /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" /></label>
        <label>角色<select value={role} onChange={(event) => setRole(event.target.value)}>{roleOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        {error ? <div className="login-error">{error}</div> : null}
        <button className="primary-btn" type="submit">进入系统</button>
      </form>
    </div>
  )
}

function AdminPage({ user, tasks, stats, onLogout }) {
  const records = tasks.flatMap((task) => task.records.map((record) => ({ ...record, taskName: task.name, location: `${task.windFarm} / ${task.turbineId} / ${task.bladeId}` })))
  const logs = tasks.flatMap((task) => (task.logs || []).map((log) => ({ ...log, taskName: task.name })))
  const totalLogs = logs.length
  const severeTasks = tasks.filter((task) => task.records.some((record) => record.result?.alert?.level === '严重')).length
  const archiveTasks = tasks.filter((task) => getTaskStatus(task) === '已归档').length
  const taskCompletionRate = stats.taskCount ? `${Math.round((archiveTasks / stats.taskCount) * 100)}%` : '0%'
  const reviewerCount = new Set(records.filter((record) => record.review?.reviewer).map((record) => record.review.reviewer)).size
  const inspectors = new Set(tasks.map((task) => task.inspector).filter(Boolean))
  const actors = new Set([user.username, ...logs.map((log) => log.actor).filter(Boolean), ...inspectors])
  const userList = [
    {
      id: 'USER-SELF',
      name: user.username,
      role: user.role,
      status: '在线',
      lastLogin: user.loginAt || '--',
      duty: '当前登录账号',
    },
    ...Array.from(inspectors)
      .filter((name) => name && name !== user.username)
      .map((name, index) => ({
        id: `USER-INSP-${index + 1}`,
        name,
        role: '巡检员',
        status: '历史活跃',
        lastLogin: tasks.find((task) => task.inspector === name)?.createdAt || '--',
        duty: '任务创建人',
      })),
    ...Array.from(new Set(logs.map((log) => log.actor).filter((name) => name && name !== user.username && !inspectors.has(name)))).map((name, index) => ({
      id: `USER-ACTOR-${index + 1}`,
      name,
      role: '运维协同用户',
      status: '日志活跃',
      lastLogin: logs.find((log) => log.actor === name)?.time || '--',
      duty: '操作日志参与者',
    })),
  ]
  const latestRecord = records[0] || null
  const latestLog = logs[0] || null
  const dirtyCount = records.flatMap((record) => record.result?.detections || []).filter((item) => item.class_name === '脏污').length
  const damageCount = records.flatMap((record) => record.result?.detections || []).filter((item) => item.class_name === '损坏').length
  const backendStatus = latestRecord ? '在线' : '待接入检测数据'
  const frontendStatus = '在线'
  const modelStatus = records.length ? '已执行推理' : '已部署待调用'
  const systemHealth = records.length ? '运行中' : '待接入数据'
  const recentLogs = logs.slice(0, 5)
  const notices = [
    `当前系统共管理 ${stats.taskCount} 个巡检任务，已归档 ${archiveTasks} 个。`,
    `累计检测记录 ${stats.recordCount} 条，其中脏污 ${dirtyCount} 处、损坏 ${damageCount} 处。`,
    latestRecord
      ? `最近一次检测记录为 ${latestRecord.filename}，来自任务 ${latestRecord.taskName}。`
      : '当前尚无检测记录，可由巡检员上传图像后生成管理员统计信息。',
    latestLog
      ? `最近一条操作日志为“${latestLog.action}”，执行人 ${latestLog.actor}。`
      : '当前尚无操作日志，后续任务创建与复核操作将自动沉淀到此。',
  ]

  return (
    <div className="page wide-page admin-page">
      <header className="hero panel-glow">
        <div className="hero-content">
          <span className="badge">System Administration Console</span>
          <h1>风电叶片巡检系统管理员中心</h1>
          <p>该界面面向系统管理员，用于统一查看平台运行状态、账号权限分布、任务归档情况以及模型服务概览。</p>
          <div className="feature-list">{adminFeatures.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
        <div className="hero-card">
          <strong>{stats.taskCount}</strong>
          <span>平台巡检任务总数</span>
          <small>{user.role} · {user.username}</small>
          <small>登录时间 · {user.loginAt || '--'}</small>
          <button className="ghost-btn" onClick={onLogout}>退出登录</button>
        </div>
      </header>

      <section className="overview-grid admin-overview-grid">
        <div className="overview-card"><span>系统状态</span><strong>{systemHealth}</strong></div>
        <div className="overview-card"><span>检测记录总量</span><strong>{stats.recordCount}</strong></div>
        <div className="overview-card"><span>高风险任务</span><strong>{severeTasks}</strong></div>
        <div className="overview-card"><span>待复核记录</span><strong>{stats.pendingReviews}</strong></div>
        <div className="overview-card"><span>归档完成率</span><strong>{taskCompletionRate}</strong></div>
        <div className="overview-card"><span>活跃账号数</span><strong>{actors.size}</strong></div>
      </section>

      <main className="admin-dashboard">
        <section className="card admin-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">User Control</p>
              <h2>用户与角色管理</h2>
            </div>
            <span className="record-count">{userList.length} 个账号来源</span>
          </div>
          <div className="admin-user-list">
            {userList.map((item) => (
              <div className="admin-user-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.role}</span>
                </div>
                <div>
                  <small>{item.duty}</small>
                  <small>{item.lastLogin}</small>
                </div>
                <span className={item.status === '在线' ? 'status online' : 'status'}>{item.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card admin-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">System Monitor</p>
              <h2>平台运行监控</h2>
            </div>
          </div>
          <div className="admin-metric-grid">
            <div className="metric-box">
              <span>后端服务</span>
              <strong>{backendStatus}</strong>
              <small>{latestRecord ? `最近处理记录：${latestRecord.filename}` : '尚未接收到检测请求记录'}</small>
            </div>
            <div className="metric-box">
              <span>前端服务</span>
              <strong>{frontendStatus}</strong>
              <small>当前管理员界面已接入本地任务、日志和复核数据统计</small>
            </div>
            <div className="metric-box">
              <span>模型调用状态</span>
              <strong>{modelStatus}</strong>
              <small>{records.length ? `平均检测耗时 ${stats.avgElapsed} ms` : '等待巡检员上传图像后触发推理'}</small>
            </div>
            <div className="metric-box">
              <span>人工复核覆盖</span>
              <strong>{reviewerCount} 人参与</strong>
              <small>{stats.reviewedRecords} 条记录已复核，{stats.pendingReviews} 条待复核</small>
            </div>
          </div>
        </section>

        <section className="card admin-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Task Summary</p>
              <h2>任务归档与风险概览</h2>
            </div>
          </div>
          <div className="admin-task-table">
            <div className="admin-task-row admin-task-head">
              <span>任务名称</span>
              <span>位置</span>
              <span>状态</span>
              <span>记录数</span>
              <span>风险级别</span>
            </div>
            {tasks.length ? tasks.map((task) => {
              const taskRisk = task.records.some((record) => record.result?.alert?.level === '严重')
                ? '严重'
                : task.records.some((record) => record.result?.alert?.triggered)
                  ? '关注'
                  : '正常'
              return (
                <div className="admin-task-row" key={task.id}>
                  <span>{task.name}</span>
                  <span>{task.windFarm} / {task.turbineId} / {task.bladeId}</span>
                  <span>{getTaskStatus(task)}</span>
                  <span>{task.records.length}</span>
                  <span className={`severity severity-${taskRisk}`}>{taskRisk}</span>
                </div>
              )
            }) : <div className="empty-records">当前暂无任务数据，管理员界面会在巡检任务创建后自动汇总真实数据。</div>}
          </div>
        </section>

        <section className="card admin-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Platform Notice</p>
              <h2>系统公告与维护建议</h2>
            </div>
          </div>
          <div className="admin-notice-list">
            {notices.map((item) => <div className="notice-item" key={item}>{item}</div>)}
          </div>
        </section>

        <section className="card admin-panel admin-panel-wide">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Recent Audit</p>
              <h2>最近操作日志</h2>
            </div>
            <span className="record-count">最近 {recentLogs.length} 条</span>
          </div>
          {recentLogs.length ? (
            <div className="admin-log-list">
              {recentLogs.map((log) => (
                <div className="log-item" key={log.id}>
                  <strong>{log.action}</strong>
                  <span>{log.time} · {log.actor} · {log.taskName}</span>
                  <small>{log.target}{log.detail ? ` · ${log.detail}` : ''}</small>
                </div>
              ))}
            </div>
          ) : <div className="empty-records">当前暂无操作日志。</div>}
        </section>
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LOGIN_KEY) || sessionStorage.getItem(LOGIN_KEY))
    } catch {
      return null
    }
  })
  const [tasks, setTasks] = useState(loadStoredTasks)
  const [activeTaskId, setActiveTaskId] = useState(() => loadStoredTasks()[0]?.id ?? null)
  const [activeRecordId, setActiveRecordId] = useState(null)
  const [taskForm, setTaskForm] = useState({ name: '', windFarm: '风场A区', turbineId: 'WT-001', bladeId: 'Blade-A' })
  const [deviceTopology, setDeviceTopology] = useState([])
  const [processingStatusDraft, setProcessingStatusDraft] = useState('待处理')
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState('')
  const [confidence, setConfidence] = useState(0.25)
  const [reviewDraft, setReviewDraft] = useState({ status: '未复核', comment: '' })
  const [loading, setLoading] = useState(false)

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [tasks, activeTaskId])
  const activeRecord = useMemo(() => activeTask?.records.find((record) => record.id === activeRecordId) || activeTask?.records[0] || null, [activeTask, activeRecordId])
  const selectedFarm = useMemo(() => deviceTopology.find((item) => item.windFarm === taskForm.windFarm) || null, [deviceTopology, taskForm.windFarm])
  const turbineOptions = selectedFarm?.turbines || []
  const selectedTurbine = turbineOptions.find((item) => item.id === taskForm.turbineId) || turbineOptions[0] || null
  const bladeOptions = selectedTurbine?.blades || []
  const stats = useMemo(() => calculateStats(tasks), [tasks])

  const currentOriginalUrl = activeRecord?.originalUrl || selectedPreviewUrl
  const currentAnnotatedUrl = activeRecord?.annotatedUrl || ''
  const currentResult = activeRecord?.result || null

  useEffect(() => {
    fetchDeviceTopology().then((data) => setDeviceTopology(data))
  }, [])

  useEffect(() => {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks.slice(0, 12)))
    localStorage.removeItem(LEGACY_RECORD_KEY)
  }, [tasks])

  useEffect(() => {
    setReviewDraft({ status: activeRecord?.review?.status || '未复核', comment: activeRecord?.review?.comment || '' })
    setProcessingStatusDraft(activeRecord?.processingStatus || '待处理')
  }, [activeRecord?.id])

  const handleLogout = () => {
    localStorage.removeItem(LOGIN_KEY)
    sessionStorage.removeItem(LOGIN_KEY)
    setUser(null)
  }

  const handleCreateTask = () => {
    const baseTask = createDefaultTask(user)
    const task = {
      ...baseTask,
      name: taskForm.name.trim() || baseTask.name,
      windFarm: taskForm.windFarm.trim() || baseTask.windFarm,
      turbineId: taskForm.turbineId.trim() || baseTask.turbineId,
      bladeId: taskForm.bladeId.trim() || baseTask.bladeId,
    }
    const createdTask = appendTaskLog(task, createLogEntry(user.username, '创建巡检任务', task.name, `${task.windFarm} / ${task.turbineId} / ${task.bladeId}`))
    setTasks((prev) => [createdTask, ...prev].slice(0, 12))
    setActiveTaskId(createdTask.id)
    setActiveRecordId(null)
  }

  const handleDeleteActiveTask = () => {
    if (!activeTask) return alert('请先选择一个巡检任务')
    if (!window.confirm(`确定删除巡检任务「${activeTask.name}」吗？该任务下的记录也会一并删除。`)) return
    const nextTasks = tasks.filter((task) => task.id !== activeTask.id)
    setTasks(nextTasks)
    setActiveTaskId(nextTasks[0]?.id ?? null)
    setActiveRecordId(nextTasks[0]?.records?.[0]?.id ?? null)
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    fileToDataUrl(file).then(setSelectedPreviewUrl)
  }

  const addRecordToActiveTask = (record) => {
    setTasks((prev) => prev.map((task) => {
      if (task.id !== activeTaskId) return task
      const nextTask = normalizeTask({ ...task, records: [record, ...task.records].slice(0, 30) })
      return appendTaskLog(nextTask, createLogEntry(user.username, '新增检测记录', record.filename, `任务 ${task.name}`))
    }))
    setActiveRecordId(record.id)
  }

  const appendLogToActiveTask = (action, target, detail = '') => {
    if (!activeTask) return
    setTasks((prev) => prev.map((task) => (
      task.id === activeTask.id ? appendTaskLog(task, createLogEntry(user.username, action, target, detail)) : task
    )))
  }

  const updateActiveRecord = (updater) => {
    if (!activeTask || !activeRecord) return
    setTasks((prev) => prev.map((task) => {
      if (task.id !== activeTask.id) return task
      return {
        ...task,
        records: task.records.map((record) => record.id === activeRecord.id ? updater(record) : record),
      }
    }))
  }

  const handleSubmit = async () => {
    if (!activeTask) return alert('请先创建或选择一个巡检任务')
    if (!selectedFile) return alert('请先选择一张待检测图片')
    try {
      setLoading(true)
      const response = await inferImage(selectedFile, { confidence })
      const originalUrl = selectedPreviewUrl || await fileToDataUrl(selectedFile)
      addRecordToActiveTask(createRecord(selectedFile, response.data, originalUrl))
      setSelectedFile(null)
      setSelectedPreviewUrl('')
    } catch (error) {
      alert(error.response?.data?.detail || '检测失败，请检查后端服务。')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveReview = () => {
    if (!activeTask || !activeRecord) return alert('请先选择一条巡检记录')
    updateActiveRecord((record) => ({
      ...record,
      review: { status: reviewDraft.status, comment: reviewDraft.comment, reviewer: user.username, reviewedAt: new Date().toLocaleString() },
    }))
    appendLogToActiveTask('保存复核结果', activeRecord.filename, `状态：${reviewDraft.status}`)
  }

  const handleChangeDetectionClass = (index, className) => {
    const targetDetection = activeRecord?.result?.detections?.find((item) => item.index === index)
    updateActiveRecord((record) => updateRecordDetections(record, (detections) => detections.map((item) => item.index === index ? {
      ...item,
      class_name: className,
      class_id: className === '损坏' ? 1 : 0,
      severity: className === '损坏' ? (item.confidence >= 0.7 ? '严重' : '关注') : (item.confidence >= 0.6 ? '关注' : '轻微'),
    } : item)))
    appendLogToActiveTask('修改缺陷类别', activeRecord?.filename || '当前记录', `序号 ${index}：${targetDetection?.class_name || '未知'} → ${className}`)
  }

  const handleDeleteDetection = (index) => {
    if (!activeRecord) return
    updateActiveRecord((record) => updateRecordDetections(record, (detections) => detections.filter((item) => item.index !== index)))
    appendLogToActiveTask('删除误检缺陷', activeRecord.filename, `删除缺陷序号 ${index}`)
  }

  const handleDeleteActiveRecord = () => {
    if (!activeTask || !activeRecord) return alert('请先选择一条巡检记录')
    if (!window.confirm(`确定删除巡检记录「${activeRecord.filename}」吗？`)) return
    const nextRecords = activeTask.records.filter((record) => record.id !== activeRecord.id)
    setTasks((prev) => prev.map((task) => {
      if (task.id !== activeTask.id) return task
      return appendTaskLog({ ...task, records: nextRecords }, createLogEntry(user.username, '删除检测记录', activeRecord.filename, `剩余 ${nextRecords.length} 条记录`))
    }))
    setActiveRecordId(nextRecords[0]?.id ?? null)
  }

  const handleUpdateProcessingStatus = () => {
    if (!activeRecord) return alert('请先选择一条巡检记录')
    updateActiveRecord((record) => ({ ...record, processingStatus: processingStatusDraft }))
    appendLogToActiveTask('更新处理状态', activeRecord.filename, `处理状态：${processingStatusDraft}`)
  }

  const handleExportTaskLogs = () => {
    if (!activeTask) return alert('请先选择一个巡检任务')
    const lines = [
      `任务名称：${activeTask.name}`,
      `风场/风机/叶片：${activeTask.windFarm} / ${activeTask.turbineId} / ${activeTask.bladeId}`,
      `日志导出时间：${new Date().toLocaleString()}`,
      '========================',
      ...(activeTask.logs || []).map((log) => `${log.time} | ${log.actor} | ${log.action} | ${log.target} | ${log.detail || '无'}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeTask.name}-操作日志.txt`
    link.click()
    URL.revokeObjectURL(url)
    appendLogToActiveTask('导出操作日志', activeTask.name, '导出 TXT 操作日志')
  }

  const handleExportTaskReport = () => {
    if (!activeTask) return alert('请先选择一个巡检任务')
    const blob = new Blob([buildTaskHtmlReport(activeTask)], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeTask.name}-巡检任务报告.html`
    link.click()
    URL.revokeObjectURL(url)
    appendLogToActiveTask('导出任务报告', activeTask.name, '导出 HTML 巡检报告')
  }

  if (!user) return <LoginPage onLogin={setUser} />
  if (user.role === '系统管理员') return <AdminPage user={user} tasks={tasks} stats={stats} onLogout={handleLogout} />

  return (
    <div className="page wide-page">
      <header className="hero panel-glow">
        <div className="hero-content"><span className="badge">风电叶片智能巡检平台</span><h1>风电叶片缺陷检测与巡检闭环管理系统</h1><p>系统以巡检任务为核心组织检测流程，支持图像接入、智能识别、风险评估、人工复核、维护建议和任务级报告归档。</p><div className="feature-list">{features.map((item) => <span key={item}>{item}</span>)}</div></div>
        <div className="hero-card"><strong>{stats.taskCount}</strong><span>巡检任务</span><small>{user.role} · {user.username}</small><small>登录时间 · {user.loginAt || '--'}</small><button className="ghost-btn" onClick={handleLogout}>退出登录</button></div>
      </header>

      <section className="overview-grid">
        <div className="overview-card"><span>检测记录</span><strong>{stats.recordCount}</strong></div><div className="overview-card"><span>疑似缺陷</span><strong>{stats.defectCount}</strong></div><div className="overview-card"><span>严重预警</span><strong>{stats.severeRecords}</strong></div><div className="overview-card"><span>待复核</span><strong>{stats.pendingReviews}</strong></div><div className="overview-card"><span>已复核</span><strong>{stats.reviewedRecords}</strong></div><div className="overview-card"><span>平均耗时</span><strong>{stats.avgElapsed} ms</strong></div>
      </section>

      <main className="task-dashboard">
        <section className="card task-panel"><div className="section-title compact"><div><p className="eyebrow">Inspection Task</p><h2>巡检任务管理</h2></div></div><div className="task-form"><input placeholder="任务名称" value={taskForm.name} onChange={(event) => setTaskForm({ ...taskForm, name: event.target.value })} /><select value={taskForm.windFarm} onChange={(event) => { const farm = deviceTopology.find((item) => item.windFarm === event.target.value); const firstTurbine = farm?.turbines?.[0]; setTaskForm({ ...taskForm, windFarm: event.target.value, turbineId: firstTurbine?.id || '', bladeId: firstTurbine?.blades?.[0] || '' }) }}>{deviceTopology.map((item) => <option key={item.windFarm} value={item.windFarm}>{item.windFarm}</option>)}</select><select value={taskForm.turbineId} onChange={(event) => { const turbine = turbineOptions.find((item) => item.id === event.target.value); setTaskForm({ ...taskForm, turbineId: event.target.value, bladeId: turbine?.blades?.[0] || '' }) }}>{turbineOptions.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select><select value={taskForm.bladeId} onChange={(event) => setTaskForm({ ...taskForm, bladeId: event.target.value })}>{bladeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="primary-btn" onClick={handleCreateTask}>创建巡检任务</button></div><div className="task-actions"><button className="danger-btn" onClick={handleDeleteActiveTask} disabled={!activeTask}>删除当前任务</button></div><div className="task-list">{tasks.map((task) => <button key={task.id} className={task.id === activeTaskId ? 'task-item active' : 'task-item'} onClick={() => { setActiveTaskId(task.id); setActiveRecordId(task.records[0]?.id ?? null) }}><strong>{task.name}</strong><span>{task.windFarm} · {task.turbineId} · {task.bladeId}</span><small>{getTaskStatus(task)} · 记录 {task.records.length} 条</small></button>)}</div></section>

        <section className="card control-card"><div className="section-title compact"><div><p className="eyebrow">Image Input</p><h2>图像接入与检测</h2></div></div><label className="file-drop"><input type="file" accept="image/*" onChange={handleFileChange} /><span>{selectedFile ? selectedFile.name : '选择当前任务的巡检图片'}</span></label><div className="threshold-box"><div><span>置信度阈值</span><strong>{confidence.toFixed(2)}</strong></div><input type="range" min="0.05" max="0.95" step="0.05" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /><small>阈值越低越敏感，阈值越高结果越严格。</small></div><button className="primary-btn" onClick={handleSubmit} disabled={loading}>{loading ? '正在分析巡检图像...' : '开始巡检分析'}</button><button className="secondary-btn" onClick={handleExportTaskReport} disabled={!activeTask}>导出任务 HTML 报告</button><button className="secondary-btn" onClick={handleExportTaskLogs} disabled={!activeTask}>导出操作日志</button></section>

        <section className="card record-list-card"><div className="section-title compact"><div><p className="eyebrow">Task Records</p><h2>任务检测记录</h2></div><span className="record-count">{activeTask?.records.length ?? 0} 条</span></div>{activeTask?.records.length ? <div className="record-list">{activeTask.records.map((record) => <button key={record.id} className={record.id === activeRecord?.id ? 'record-item active' : 'record-item'} onClick={() => setActiveRecordId(record.id)}><img src={record.originalUrl} alt={record.filename} /><div><strong>{record.filename}</strong><span>{record.createdAt}</span><small>缺陷 {record.result.summary?.defect_count ?? 0} 处 · {record.review?.status}</small></div></button>)}</div> : <div className="empty-records">当前任务暂无检测记录。</div>}</section>

        <section className="image-grid task-image-grid"><div className="card image-panel"><div className="section-title compact"><div><p className="eyebrow">Raw Image</p><h2>巡检原图</h2></div></div>{currentOriginalUrl ? <img className="display-image" src={currentOriginalUrl} alt="巡检原图" /> : <div className="empty-preview">请选择图片或记录</div>}</div><div className="card image-panel highlight-panel"><div className="section-title compact"><div><p className="eyebrow">Detection Result</p><h2>缺陷定位结果</h2></div></div>{currentAnnotatedUrl ? <img className="display-image" src={currentAnnotatedUrl} alt="缺陷定位结果" /> : <div className="empty-preview">检测后显示标注结果</div>}</div></section>

        <section className="card review-panel"><div className="section-title compact"><div><p className="eyebrow">Human Review</p><h2>人工复核与维护建议</h2></div></div><div className="suggestion-box"><span>系统维护建议</span><p>{activeRecord?.maintenanceSuggestion || '选择检测记录后生成维护建议。'}</p></div><div className="review-form"><select value={reviewDraft.status} onChange={(event) => setReviewDraft({ ...reviewDraft, status: event.target.value })} disabled={!activeRecord}><option>未复核</option><option>已确认</option><option>误报</option><option>需复检</option></select><select value={processingStatusDraft} onChange={(event) => setProcessingStatusDraft(event.target.value)} disabled={!activeRecord}><option>待处理</option><option>已派单</option><option>处理中</option><option>已完成</option><option>持续观察</option></select><textarea placeholder="填写人工复核意见" value={reviewDraft.comment} onChange={(event) => setReviewDraft({ ...reviewDraft, comment: event.target.value })} disabled={!activeRecord} /><button className="secondary-btn" onClick={handleSaveReview} disabled={!activeRecord}>保存复核结果</button><button className="secondary-btn" onClick={handleUpdateProcessingStatus} disabled={!activeRecord}>保存处理状态</button><button className="danger-btn" onClick={handleDeleteActiveRecord} disabled={!activeRecord}>删除选中记录</button></div></section>

        <section className="card log-panel"><div className="section-title compact"><div><p className="eyebrow">Operation Audit</p><h2>操作日志</h2></div><span className="record-count">{activeTask?.logs?.length ?? 0} 条</span></div>{activeTask?.logs?.length ? <div className="log-list">{activeTask.logs.map((log) => <div key={log.id} className="log-item"><strong>{log.action}</strong><span>{log.time} · {log.actor}</span><small>{log.target}{log.detail ? ` · ${log.detail}` : ''}</small></div>)}</div> : <div className="empty-records">当前任务暂无操作日志。</div>}</section>

        {currentResult?.message && !currentResult.model_loaded ? <div className="error-card">{currentResult.message}</div> : null}
        <ResultPanel result={currentResult} record={activeRecord} onChangeDetectionClass={handleChangeDetectionClass} onDeleteDetection={handleDeleteDetection} />
      </main>
    </div>
  )
}

export default App
