import { apiJson } from './client.js'
import { MIN_SHAPE_SIZE } from '../constants/board.js'

export async function listTemplates() {
  const data = await apiJson('/api/templates')
  const items = Array.isArray(data) ? data : (data?.items ?? [])
  return {
    items,
    total: items.length,
    limit: 100,
  }
}

export async function getTemplate(templateId) {
  return apiJson(`/api/templates/${templateId}`)
}

export function buildCreateTemplateRequest(name, draft) {
  const bounds = draft?.bounds
  const events = draft?.events ?? []

  if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) {
    throw new Error('Некорректные размеры области шаблона')
  }
  if (bounds.width < MIN_SHAPE_SIZE || bounds.height < MIN_SHAPE_SIZE) {
    throw new Error('Слишком маленькая выделенная область')
  }
  if (!events.length) {
    throw new Error('Шаблон должен содержать хотя бы одно событие')
  }

  const body = {
    name,
    bounds: {
      width: bounds.width,
      height: bounds.height,
    },
    events,
  }

  if (draft.previewData) {
    body.previewData = draft.previewData
  }

  return body
}

export async function createTemplate(body) {
  return apiJson('/api/templates', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteTemplate(templateId) {
  return apiJson(`/api/templates/${templateId}`, {
    method: 'DELETE',
  })
}

export async function insertTemplate(roomId, templateId, { x, y, scale = 1 }) {
  return apiJson(`/room/${roomId}/templates/${templateId}/insert`, {
    method: 'POST',
    body: JSON.stringify({ x, y, scale }),
  })
}

export function readTemplateBounds(meta) {
  const bounds = meta?.bounds ?? meta?.content?.bounds
  const width = bounds?.width
  const height = bounds?.height
  if (!(width > 0) || !(height > 0)) {
    return { width: 0.12, height: 0.08 }
  }
  return { width, height }
}
