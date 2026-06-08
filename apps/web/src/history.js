/**
 * 编辑历史：撤销上一步修改、恢复打开项目时的初始状态
 */
import { state, normalizeQuoteLayout } from "./state.js";

const MAX_UNDO_STEPS = 50;

export function initializeProjectHistory(data) {
  state.undoStack = [];
  state.originalProjectData = cloneData(data);
}

export function recordUndoSnapshot() {
  if (!state.activeProject?.data) return;

  const snapshot = JSON.stringify(state.activeProject.data);
  if (state.undoStack.at(-1) === snapshot) return;

  state.undoStack.push(snapshot);
  if (state.undoStack.length > MAX_UNDO_STEPS) state.undoStack.shift();
}

export function undoLastChange() {
  if (!state.activeProject || !state.undoStack.length) return false;

  const snapshot = state.undoStack.pop();
  state.activeProject.data = JSON.parse(snapshot);
  normalizeQuoteLayout(state.activeProject.data);
  state.dirty = true;
  return true;
}

export function restoreOriginalProjectData() {
  if (!state.activeProject || !state.originalProjectData) return false;

  recordUndoSnapshot();
  state.activeProject.data = cloneData(state.originalProjectData);
  normalizeQuoteLayout(state.activeProject.data);
  state.dirty = true;
  return true;
}

function cloneData(data) {
  return structuredClone(data || {});
}
