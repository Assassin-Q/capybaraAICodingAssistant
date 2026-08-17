import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { errorMessage } from "@/components/assistant/shared";
import { approvalModeAllows, type ApprovalMode } from "@/lib/approvalMode";
import { ideaApi } from "@/lib/idea";
import { openCodeApi, type PermissionReply, type PermissionRequest, type QuestionRequest } from "@/lib/opencode";

type QuestionAnswers = Record<string, string[][]>;

interface ApprovalInteractionOptions {
  approvalMode: ApprovalMode;
  projectPath?: string;
  runStatus: string;
  selectedSessionID: string;
  setError: Dispatch<SetStateAction<string>>;
  setPendingApprovalSessionIDs: Dispatch<SetStateAction<string[]>>;
}

const allowanceKey = (action: string) => action.trim().toLowerCase();

/** Owns pending approvals and question forms without making App carry their protocol details. */
export function useApprovalInteractions({
  approvalMode,
  projectPath,
  runStatus,
  selectedSessionID,
  setError,
  setPendingApprovalSessionIDs,
}: ApprovalInteractionOptions) {
  const [permissions, setPermissionsState] = useState<PermissionRequest[]>([]);
  const [questions, setQuestions] = useState<QuestionRequest[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswers>({});
  const autoAnswerRef = useRef<((requests: PermissionRequest[]) => PermissionRequest[])>();
  const approvalModeRef = useRef(approvalMode);
  const autoAnsweredRef = useRef(new Set<string>());
  const runAllowancesRef = useRef(new Set<string>());
  approvalModeRef.current = approvalMode;

  /** Keeps array identity stable so one-second polling cannot flicker the approval card. */
  const setPermissions = useCallback((next: SetStateAction<PermissionRequest[]>) => {
    setPermissionsState((current) => {
      const raw = typeof next === "function" ? next(current) : next;
      const value = autoAnswerRef.current ? autoAnswerRef.current(raw) : raw;
      const same = value.length === current.length
        && value.every((item, index) => item.id === current[index]?.id);
      return same ? current : value;
    });
  }, []);

  const syncQuestionAnswers = useCallback((requests: QuestionRequest[]) => {
    setQuestionAnswers((current) => {
      const next = { ...current };
      requests.forEach((request) => {
        next[request.id] ??= request.questions.map(() => []);
      });
      return next;
    });
  }, []);

  const autoAnswerPermissions = useCallback((requests: PermissionRequest[]): PermissionRequest[] => {
    if (!projectPath) return requests;
    return requests.filter((request) => {
      const allowedForRun = runAllowancesRef.current.has(allowanceKey(request.action));
      if (!allowedForRun && !approvalModeAllows(approvalModeRef.current, request.action)) return true;
      if (autoAnsweredRef.current.has(request.id)) return false;
      autoAnsweredRef.current.add(request.id);
      void openCodeApi
        .replyPermission(request.sessionID, request.id, "once", projectPath)
        .catch((error: unknown) => {
          if (/not found/i.test(errorMessage(error))) return;
          autoAnsweredRef.current.delete(request.id);
          setError(errorMessage(error));
        });
      return false;
    });
  }, [projectPath, setError]);
  autoAnswerRef.current = autoAnswerPermissions;

  // A task allowance ends on the next submitted prompt or when the visible session changes.
  useEffect(() => {
    if (runStatus === "submitted") runAllowancesRef.current.clear();
  }, [runStatus]);
  useEffect(() => {
    runAllowancesRef.current.clear();
  }, [selectedSessionID]);

  const handlePermissionReply = useCallback(async (request: PermissionRequest, reply: PermissionReply) => {
    if (!projectPath) return;
    const effective: PermissionReply = reply === "always" ? "once" : reply;
    if (reply === "always") runAllowancesRef.current.add(allowanceKey(request.action));
    try {
      await openCodeApi.replyPermission(request.sessionID, request.id, effective, projectPath);
    } catch (replyError) {
      if (!/not found/i.test(errorMessage(replyError))) {
        setError(errorMessage(replyError));
        return;
      }
    }
    setPermissions((current) => {
      const next = current.filter((item) => item.id !== request.id);
      if (next.length === 0) {
        setPendingApprovalSessionIDs((ids) => ids.filter((id) => id !== request.sessionID));
        void ideaApi.setPendingApproval(request.sessionID, false).catch(() => undefined);
      }
      return next;
    });
  }, [projectPath, setError, setPendingApprovalSessionIDs, setPermissions]);

  const handleQuestionReply = useCallback(async (request: QuestionRequest) => {
    if (!projectPath) return;
    try {
      await openCodeApi.replyQuestion(
        request.sessionID,
        request.id,
        questionAnswers[request.id] ?? request.questions.map(() => []),
        projectPath,
      );
      setQuestions((current) => current.filter((item) => item.id !== request.id));
    } catch (replyError) {
      setError(errorMessage(replyError));
    }
  }, [projectPath, questionAnswers, setError]);

  const handleQuestionReject = useCallback(async (request: QuestionRequest) => {
    if (!projectPath) return;
    try {
      await openCodeApi.rejectQuestion(request.sessionID, request.id, projectPath);
      setQuestions((current) => current.filter((item) => item.id !== request.id));
    } catch (rejectError) {
      setError(errorMessage(rejectError));
    }
  }, [projectPath, setError]);

  const handleQuestionChange = useCallback((request: QuestionRequest, index: number, values: string[]) => {
    setQuestionAnswers((current) => {
      const answers = current[request.id] ?? request.questions.map(() => []);
      const nextAnswers = answers.map((answer) => [...answer]);
      nextAnswers[index] = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
      return { ...current, [request.id]: nextAnswers };
    });
  }, []);

  return {
    handlePermissionReply,
    handleQuestionChange,
    handleQuestionReject,
    handleQuestionReply,
    permissions,
    questionAnswers,
    questions,
    setPermissions,
    setQuestionAnswers,
    setQuestions,
    syncQuestionAnswers,
  };
}
