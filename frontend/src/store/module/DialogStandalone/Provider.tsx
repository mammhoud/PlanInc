import { Button } from "@/components/ui/button";
import { Dialog as UIDialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { observer } from "mobx-react-lite";
import { DialogStandaloneStore } from ".";
import { RootStore } from "@/store/root";
import { useHistoryBack, useIsIOS } from "@/lib/hooks";
import { motion } from "motion/react";
import { Icon } from '@/components/Common/Iconify/icons';
import { CancelIcon } from "@/components/Common/Icons";
import { useSideNav } from '@/platform/PlatformProvider';

const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <motion.div
    onClick={onClose}
    className={`cursor-pointer absolute
    top-2 right-2 bg-background border-2 border-border z-[2002] text-foreground p-2 rounded-full
    !w-[35px] !h-[35px] flex items-center justify-center shadow-lg`}
    whileTap={{
      scale: 0.85,
      backgroundColor: "var(--muted)"
    }}
    whileHover={{
      scale: 1.1,
      backgroundColor: "var(--accent)"
    }}
    transition={{
      type: "spring",
      stiffness: 400,
      damping: 17
    }}
  >
    <motion.div
      whileTap={{ rotate: 90 }}
      whileHover={{ rotate: 45 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <CancelIcon className='primary-foreground !transition-all' />
    </motion.div>
  </motion.div>
);



const Dialog = observer(() => {
  const modal = RootStore.Get(DialogStandaloneStore);
  const isPc = useSideNav()
  const { className, isOpen, title, size, content, isDismissable, onlyContent = false, noPadding = false, showOnlyContentCloseButton = false, transparent = false } = modal;
  const Content = typeof content === 'function' ? content : () => content;
  const isIOS = useIsIOS()
  useHistoryBack({
    state: isOpen,
    onStateChange: () => modal.close(),
    historyState: 'modal'
  });

  const motionConfig = {
    initial: "enter",
    animate: "enter",
    exit: "exit",
    variants: {
      enter: {
        y: 0,
        opacity: 1,
        transition: { type: 'spring', bounce: 0.5, duration: 0.6 },
      },
      exit: {
        y: -20,
        opacity: 0,
        transition: { type: 'spring', bounce: 0.5, duration: 0.3 },
      },
    }
  };

  const dialogMaxWidth = (() => {
    switch (size) {
      case 'xs':
        return 'max-w-xs';
      case 'sm':
        return 'max-w-sm';
      case 'md':
        return 'max-w-lg';
      case 'lg':
        return 'max-w-xl';
      case 'xl':
        return 'max-w-2xl';
      case '2xl':
        return 'max-w-4xl';
      case '3xl':
        return 'max-w-5xl';
      case '4xl':
        return 'max-w-6xl';
      case '5xl':
        return 'max-w-7xl';
      case 'full':
        return 'max-w-[95vw]';
      default:
        return 'max-w-lg';
    }
  })();

  const handleInteractOutside = (e: Event) => {
    if (!isDismissable) {
      e.preventDefault();
    }
  };

  const containerClass = isPc
    ? "fixed inset-0 z-[2001] flex justify-center items-center pointer-events-none max-w-screen-2xl mx-auto left-0 right-0"
    : "fixed bottom-0 left-0 right-0 z-[2001] flex flex-col items-center pointer-events-none";

  const modalSizeClass = (() => {
    const baseClass = 'mx-auto ';
    switch (size) {
      case 'xs':
        return baseClass + 'w-1/4';
      case 'sm':
        return baseClass + 'w-1/3';
      case 'md':
        return baseClass + 'w-1/2';
      case 'lg':
        return baseClass + 'w-2/3';
      case 'xl':
        return baseClass + 'w-3/4';
      case '2xl':
        return baseClass + 'w-4/5';
      case '3xl':
        return baseClass + 'w-5/6';
      case '4xl':
        return baseClass + 'w-11/12';
      case '5xl':
        return baseClass + 'w-full';
      case 'full':
        return baseClass + 'w-full';
      default:
        return baseClass + 'w-full';
    }
  })();

  if (isIOS && isOpen) {
    return (
      <>
        <div
          className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm"
          onClick={() => {
            if (isDismissable) {
              modal.close()
            }
          }}
        />
        <motion.div
          className={`${containerClass} ${isPc ? modalSizeClass : ''} `}
          {...motionConfig}
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
        >
          {!onlyContent && (
            <motion.div
              className="w-full bg-background border-secondbackground p-1 rounded-t-lg shadow-lg pointer-events-auto"
              {...motionConfig}
            >
              <div className="flex flex-col justify-between items-center p-4 gap-2">
                <div className="flex gap-2 w-full items-center">
                  <div className="text-lg font-semibold">{title ?? ''}</div>
                  <Button size="icon-sm" variant="ghost" onClick={() => modal.close()} className="ml-auto">
                    <Icon icon="tabler:x" width="16" height="16" />
                  </Button>
                </div>
                <div className="w-full" >
                  <Content />
                </div>
              </div>
            </motion.div>
          )}
          {
            onlyContent && <motion.div
              className="w-full pointer-events-auto "
              {...motionConfig}
            >
              <div className="relative">
                {
                  showOnlyContentCloseButton &&
                  <CloseButton onClose={() => modal.close()} />
                }
                <div className="w-full" >
                  <Content />
                </div>
              </div>
            </motion.div>
          }
        </motion.div>
      </>
    )
  }
  return (
    <UIDialog
      open={isOpen}
      onOpenChange={(open: boolean) => {
        if (open) {
          modal.preventClose = false
        }
        if (!open) {
          if (!modal.preventClose) {
            modal.close();
          }
        }
      }}
    >
      {
        onlyContent ?
          <DialogContent
            style={{ zIndex: 2000 }}
            className={cn(dialogMaxWidth, "max-h-[85vh] overflow-y-auto overflow-visible relative modal-content", className, transparent && 'bg-transparent border-none shadow-none')}
            onEscapeKeyDown={handleInteractOutside}
            onPointerDownOutside={handleInteractOutside}
          >
            {
              showOnlyContentCloseButton &&
              <CloseButton onClose={() => modal.close()} />
            }
            <Content />
          </DialogContent> :
          <DialogContent
            style={{ zIndex: 2000 }}
            className={cn(dialogMaxWidth, "max-h-[85vh] overflow-y-auto", className, transparent && 'bg-transparent')}
            onEscapeKeyDown={handleInteractOutside}
            onPointerDownOutside={handleInteractOutside}
          >
            {title && <DialogHeader className="flex flex-col gap-1"><DialogTitle>{title}</DialogTitle></DialogHeader>}
            <div className={`${noPadding ? '' : 'p-2 md:p-4 '}`}>
              <Content />
            </div>
          </DialogContent>
      }
    </UIDialog>
  );
});

export default Dialog;