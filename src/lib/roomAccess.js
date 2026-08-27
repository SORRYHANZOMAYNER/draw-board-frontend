export function getRoomOwnerId(room) {
  return room?.ownerId ?? room?.owner_id ?? null
}

export function getCurrentUserId(user) {
  return user?.userId ?? user?.id ?? null
}

export function isRoomOwner(room, user) {
  const ownerId = getRoomOwnerId(room)
  const userId = getCurrentUserId(user)
  if (ownerId == null || userId == null) return false
  return Number(ownerId) === Number(userId)
}