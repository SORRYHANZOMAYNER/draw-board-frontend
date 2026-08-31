const STORAGE_VERSION = 1

export function incognitoStorageKey(roomId) {
  return `board-incognito-v${STORAGE_VERSION}:${roomId}`
}

export function loadIncognitoData(roomId) {
  if (!roomId) return null

  try {
    const raw = localStorage.getItem(incognitoStorageKey(roomId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function saveIncognitoData(roomId, data) {
  if (!roomId) return

  try {
    localStorage.setItem(incognitoStorageKey(roomId), JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to save incognito board data', error)
  }
}

export function clearIncognitoData(roomId) {
  if (!roomId) return
  localStorage.removeItem(incognitoStorageKey(roomId))
}

export function mapToArray(map) {
  return [...map.entries()].map(([id, value]) => ({ id, value }))
}

export function arrayToMap(items) {
  const map = new Map()
  for (const item of items ?? []) {
    if (item?.id != null) map.set(item.id, item.value)
  }
  return map
}


