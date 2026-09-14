import React from 'react';
import ConfirmDialog, { ConfirmDialogState } from '../ui/ConfirmDialog';
import type { EnrollmentFeedbackDialog } from '../../lib/useCourseEnrollment';

interface CourseEnrollmentDialogsProps {
  confirmDialog: ConfirmDialogState | null;
  unregistering: boolean;
  handleUnregister: () => void;
  cancelUnregister: () => void;
  feedbackDialog: EnrollmentFeedbackDialog | null;
  setFeedbackDialog: (dialog: EnrollmentFeedbackDialog | null) => void;
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
    {feedbackDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/45 p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                feedbackDialog.type === 'success' ? 'bg-sage-500' : 'bg-danger'
              }`}
              aria-hidden
            />
            <h3 className="text-lg font-medium text-text">{feedbackDialog.title}</h3>
          </div>
          <p className="text-sm leading-6 text-textMuted">{feedbackDialog.message}</p>
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setFeedbackDialog(null)}
              className={`rounded-full px-6 py-2 text-sm font-medium text-onBrand transition-colors ${
                feedbackDialog.type === 'success'
                  ? 'bg-brand hover:bg-brandPressed'
                  : 'bg-danger hover:bg-danger'
              }`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    )}
  </>
);

export default CourseEnrollmentDialogs;
