import { useEffect, useState } from "react";
import { isMacPlatform } from "@/lib/system";
import { isWailsEnvironment } from "@/lib/runtime";
import { Events, Window as WailsWindow } from "@wailsio/runtime";

function checkIsFullscreen(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const isDocFs = Boolean(document.fullscreenElement);
  const isMediaFs =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: fullscreen)").matches;
  const isScreenFs =
    typeof window.screen !== "undefined" &&
    window.innerWidth > 0 &&
    window.screen.width > 0 &&
    window.innerWidth === window.screen.width &&
    window.innerHeight === window.screen.height;

  return Boolean(isDocFs || isMediaFs || isScreenFs);
}

export function useFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(checkIsFullscreen);

  useEffect(() => {
    let mounted = true;

    const updateFullscreen = () => {
      const fs = checkIsFullscreen();
      if (mounted) {
        setIsFullscreen(fs);
      }

      if (isWailsEnvironment()) {
        WailsWindow.IsFullscreen()
          .then((wailsFs) => {
            if (mounted && typeof wailsFs === "boolean") {
              setIsFullscreen(wailsFs);
            }
          })
          .catch(() => {});
      }
    };

    updateFullscreen();
    document.addEventListener("fullscreenchange", updateFullscreen);
    window.addEventListener("resize", updateFullscreen);

    let offFs: (() => void) | undefined;
    let offUnFs: (() => void) | undefined;

    if (isWailsEnvironment()) {
      try {
        offFs = Events.On(Events.Types.Common.WindowFullscreen as any, () => {
          if (mounted) setIsFullscreen(true);
        });
        offUnFs = Events.On(Events.Types.Common.WindowUnFullscreen as any, () => {
          if (mounted) setIsFullscreen(false);
        });
      } catch {
        // Fallback silently if Common event types not supported in environment
      }
    }

    return () => {
      mounted = false;
      document.removeEventListener("fullscreenchange", updateFullscreen);
      window.removeEventListener("resize", updateFullscreen);
      if (offFs) offFs();
      if (offUnFs) offUnFs();
    };
  }, []);

  return isFullscreen;
}

export function useHasTrafficLights(): boolean {
  const isMac = isMacPlatform();
  const isFullscreen = useFullscreen();
  return isMac && !isFullscreen;
}
