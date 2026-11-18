// Historical prediction answers remain stored, while SQL completion uses SQL attempts.
export function isCurrentQuestionAttempt(attempt, question) {
  if (!question) return false;
  if (question.gradingRevision && attempt.gradingRevision !== question.gradingRevision) return false;
  return question?.previousExecutionMode !== 'predict_public_result' || attempt.executionMode === question.executionMode;
}
export function questionDraft(draft = {}, question) {
  if (question?.gradingRevision && draft.gradingRevision !== question.gradingRevision) return {};
  if (question?.previousExecutionMode === 'predict_public_result' && draft.executionMode !== question.executionMode) return {};
  return draft;
}
