import { motion } from 'motion/react';
import { Icon } from '@/components/Common/Iconify/icons';

type PlanningFabProps = {
  /** Accessible label; also used as the tooltip title. */
  label: string;
  onPress: () => void;
  icon?: string;
  /** Optional offset overrides for pages that already reserve bottom space. */
  bottom?: number;
  right?: number;
};

/**
 * Floating action button for the planning surfaces. Mirrors the notes
 * `PlanIncAddButton` visual language (yellow circular, same position and
 * springy hover/tap feedback) so every page exposes a consistent “create”
 * entry point.
 */
export function PlanningFab({ label, onPress, icon = 'material-symbols:add', bottom = 110, right = 40 }: PlanningFabProps) {
  return (
    <div style={{ width: 50, height: 50, position: 'fixed', right, bottom, zIndex: 50 }}>
      <motion.button
        type="button"
        aria-label={label}
        title={label}
        onClick={onPress}
        whileTap={{ scale: 0.85, boxShadow: '0 0 15px 4px rgba(255, 204, 0, 0.8)' }}
        whileHover={{ scale: 1.05, boxShadow: '0 0 20px 4px rgba(255, 204, 0, 0.7)' }}
        transition={{ duration: 0.3, scale: { type: 'spring', stiffness: 400, damping: 15 } }}
        className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full text-black"
        style={{ backgroundColor: '#FFCC00', boxShadow: '0 0 10px 2px rgba(255, 204, 0, 0.5)' }}
      >
        <Icon icon={icon} width={26} height={26} />
      </motion.button>
    </div>
  );
}
