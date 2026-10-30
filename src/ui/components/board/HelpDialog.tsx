import BoardHelp from './BoardHelp';
import { Modal } from '../../screens/boardSequencer/ui/Modal';
import { Button } from '../../screens/boardSequencer/ui/Button';

/**
 * How to play, as a dialog (audit A8): it opens at the top with focus on its heading, has
 * links to its sections, and keeps Close under the scrolling text so it is always in reach.
 */
export function HelpDialog({ onClose }: { onClose(): void }): JSX.Element {
  return (
    <Modal label="How to play" onClose={onClose} maxWidth={640} footer={<Button tone="secondary" onClick={onClose}>Close</Button>}>
      <BoardHelp />
    </Modal>
  );
}
