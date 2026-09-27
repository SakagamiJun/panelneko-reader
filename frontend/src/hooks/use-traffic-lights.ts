import { useEffect, useState } from "react";
import { isMacPlatform } from "@/lib/system";

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

      // Check Wails runtime WindowIsFullscreen if available
      const runtime = (
        window as unknown as {
          runtime?: { WindowIsFullscreen?: () => Promise<boolean> };
        }
      )?.runtime;
      if (typeof runtime?.WindowIsFullscreen === "function") {
        runtime
          .WindowIsFullscreen()
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

    return () => {
      mounted = false;
      document.removeEventListener("fullscreenchange", updateFullscreen);
      window.removeEventListener("resize", updateFullscreen);
    };
  }, []);

  return isFullscreen;
}

export function useHasTrafficLights(): boolean {
  const isMac = isMacPlatform();
  const isFullscreen = useFullscreen();
  return isMac && !isFullscreen;
}
