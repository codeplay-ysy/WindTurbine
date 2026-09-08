import axios from 'axios'

const request = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  timeout: 30000,
})

export const checkHealth = () => request.get('/health')

export const inferImage = (file, options = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('confidence', options.confidence ?? 0.25)
  return request.post('/infer', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

export const receiveUavImage = (file, metadata = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('uav_id', metadata.uavId || 'UAV-001')
  formData.append('blade_id', metadata.bladeId || 'Blade-A')
  formData.append('location', metadata.location || 'WindFarm-01')
  formData.append('confidence', metadata.confidence ?? 0.25)
  return request.post('/uav/image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
