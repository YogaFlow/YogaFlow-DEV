import React from 'react';
import ConfirmDialog, { ConfirmDialogState } from '../ui/ConfirmDialog';
import FeedbackDialog, { type FeedbackDialogState } from '../ui/FeedbackDialog';

interface CourseEnrollmentDialogsProps {
  confirmDialog: ConfirmDialogState | null;
  unregistering: boolean;
  handleUnregister: () => void;
  cancelUnregister: () => void;
  feedbackDialog: FeedbackDialogState | null;
  setFeedbackDialog: (dialog: FeedbackDialogState | null) => void;
}

const CourseEnrollmentDialogs: React.FC<CourseEnrollmentDialogsProps> = ({
  confirmDialog,
  unregistering,
  handleUnregister,
  cancelUnregister,
  feedbackDialog,
  setFeedbackDialog,
}) => (
  <>
    <ConfirmDialog
      dialog={confirmDialog}
      loading={unregistering}
      onConfirm={handleUnregister}
      onCancel={cancelUnregister}
    />
    <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
  </>
);

export default CourseEnrollmentDialogs;
