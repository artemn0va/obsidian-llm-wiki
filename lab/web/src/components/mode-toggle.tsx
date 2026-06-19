import { MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/components/theme-provider';

export function ModeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          <span className="sr-only">{isDark ? 'Switch to light theme' : 'Switch to dark theme'}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent align="end">
        {isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      </TooltipContent>
    </Tooltip>
  );
}
