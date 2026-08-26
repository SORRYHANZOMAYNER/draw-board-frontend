import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

export default function AppHeader({ title = 'Интерактивная доска' }) {
  const { user, logout, isTeacher } = useAuth()

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {user && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isTeacher ? 'default' : 'secondary'}>
                {isTeacher ? 'Учитель' : 'Ученик'}
              </Badge>
              <span className="text-sm text-muted-foreground">{user.username}</span>
            </div>
          )}
        </div>
        {user && (
          <>
            <Separator orientation="vertical" className="hidden h-10 sm:block" />
            <Button variant="outline" onClick={logout}>Выйти</Button>
          </>
        )}
      </div>
    </header>
  )
}