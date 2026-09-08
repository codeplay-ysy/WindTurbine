export const TASK_STORAGE_KEY = 'wind-inspection-tasks'
export const LEGACY_RECORD_KEY = 'wind-inspection-records'
export const LOGIN_KEY = 'wind-inspection-user'
export const DEFECT_CLASS_OPTIONS = ['脏污', '损坏']

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function inferSeverity(className, confidence = 0) {
  if (className === '损坏') {
    return confidence >= 0.7 ? '严重' : '关注'
  }
  return confidence >= 0.6 ? '关注' : '轻微'
}

function normalizeDetections(result) {
  return (result?.detections || []).map((item, index) => {
    const className = item.class_name || (item.class_id === 1 ? '损坏' : '脏污')
    const classId = className === '损坏' ? 1 : 0
    return {
      ...item,
      index: index + 1,
      class_id: classId,
      class_name: className,
      severity: item.severity || inferSeverity(className, item.confidence),
    }
  })
}

function refreshResult(result) {
  const detections = normalizeDetections(result)
  const defectCount = detections.length
  const severeCount = detections.filter((item) => item.severity === '严重').length
  const hasDamage = detections.some((item) => item.class_name === '损坏')

  return {
    ...result,
    detections,
    summary: {
      ...result?.summary,
      defect_count: defectCount,
    },
    alert: {
      ...result?.alert,
      triggered: defectCount > 0,
      level: severeCount > 0 ? '严重' : defectCount ? (hasDamage ? '关注' : '提示') : '正常',
      message: defectCount
        ? `当前共识别 ${defectCount} 处疑似缺陷${severeCount ? `，其中严重风险 ${severeCount} 处` : ''}。`
        : '当前未检测到明显缺陷。',
    },
  }
}

export function loadStoredTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(TASK_STORAGE_KEY)) || []
    return tasks.map(normalizeTask)
  } catch {
    return []
  }
}

export function normalizeTask(task) {
  return {
    ...task,
    logs: task.logs || [],
    records: (task.records || []).map((record) => {
      const refreshedResult = refreshResult(record.result)
      return {
        ...record,
        result: refreshedResult,
        processingStatus: record.processingStatus || '待处理',
        review: record.review || {
          status: '未复核',
          comment: '',
          reviewer: '',
          reviewedAt: '',
        },
        maintenanceSuggestion: record.maintenanceSuggestion || buildMaintenanceSuggestion(refreshedResult),
      }
    }),
  }
}

export function createDefaultTask(user) {
  const now = new Date()
  return {
    id: `TASK-${Date.now()}`,
    name: `巡检任务-${now.toLocaleDateString()}`,
    windFarm: '风场A区',
    turbineId: 'WT-001',
    bladeId: 'Blade-A',
    inspector: user?.username || 'admin',
    createdAt: now.toLocaleString(),
    logs: [],
    records: [],
  }
}

export function createRecord(file, responseData, originalUrl) {
  const now = new Date()
  const normalizedResult = refreshResult(responseData)
  const record = {
    id: `REC-${Date.now()}-${file.name}`,
    filename: file.name,
    createdAt: now.toLocaleString(),
    originalUrl,
    annotatedUrl: responseData.annotated_image ? `data:image/jpeg;base64,${responseData.annotated_image}` : '',
    result: normalizedResult,
    processingStatus: '待处理',
    review: {
      status: '未复核',
      comment: '',
      reviewer: '',
      reviewedAt: '',
    },
  }
  return {
    ...record,
    maintenanceSuggestion: buildMaintenanceSuggestion(normalizedResult),
  }
}

export function getTaskStatus(task) {
  if (!task.records.length) return '待检测'
  if (task.records.some((record) => record.review?.status === '未复核')) return '待复核'
  return '已归档'
}

export function buildMaintenanceSuggestion(result) {
  const detections = normalizeDetections(result)
  if (!detections.length) return '未发现明显缺陷，建议按计划进行下一轮例行巡检。'

  const hasDamage = detections.some((item) => item.class_name === '损坏')
  const hasSevere = detections.some((item) => item.severity === '严重')
  const dirtyCount = detections.filter((item) => item.class_name === '脏污').length
  const damageCount = detections.filter((item) => item.class_name === '损坏').length

  if (hasDamage && hasSevere) {
    return `检测到${damageCount}处疑似损坏且风险等级较高，建议尽快安排人工复核，必要时生成维修工单并停机检查。`
  }
  if (hasDamage) {
    return `检测到${damageCount}处疑似损坏，建议由运维人员进行近距离复核，并跟踪缺陷发展情况。`
  }
  if (dirtyCount > 0) {
    return `检测到${dirtyCount}处疑似脏污，建议结合发电效率变化安排叶片清洗或后续复检。`
  }
  return '检测结果存在疑似异常，建议结合现场情况进行人工确认。'
}

export function updateRecordDetections(record, updater) {
  const nextDetections = updater(normalizeDetections(record.result))
  const nextResult = refreshResult({ ...record.result, detections: nextDetections })
  return {
    ...record,
    result: nextResult,
    maintenanceSuggestion: buildMaintenanceSuggestion(nextResult),
  }
}

export function createLogEntry(actor, action, target, detail = '') {
  return {
    id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toLocaleString(),
    actor,
    action,
    target,
    detail,
  }
}

export function appendTaskLog(task, entry) {
  return {
    ...task,
    logs: [entry, ...(task.logs || [])].slice(0, 40),
  }
}

export function calculateStats(tasks) {
  const records = tasks.flatMap((task) => task.records)
  const detections = records.flatMap((record) => record.result?.detections || [])
  const severeRecords = records.filter((record) => record.result?.alert?.level === '严重').length
  const pendingReviews = records.filter((record) => record.review?.status === '未复核').length
  const reviewedRecords = records.filter((record) => record.review?.status !== '未复核').length
  const avgElapsed = records.length
    ? records.reduce((sum, record) => sum + Number(record.result?.summary?.elapsed_ms || 0), 0) / records.length
    : 0

  return {
    taskCount: tasks.length,
    recordCount: records.length,
    defectCount: detections.length,
    severeRecords,
    pendingReviews,
    reviewedRecords,
    avgElapsed: avgElapsed.toFixed(2),
  }
}
