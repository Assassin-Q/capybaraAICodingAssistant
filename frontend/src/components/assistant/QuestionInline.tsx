import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { Input } from "@/components/ui/input";
import type { QuestionRequest } from "@/lib/opencode";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

function SelectionMark({ multiple, selected }: { multiple: boolean; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center border border-border/80 bg-background transition-colors",
        multiple ? "rounded-[4px]" : "rounded-full",
        selected && "border-primary bg-primary text-primary-foreground"
      )}
    >
      {multiple
        ? <Check className={cn("size-3", !selected && "opacity-0")} />
        : <span className={cn("size-1.5 rounded-full bg-primary-foreground", !selected && "opacity-0")} />}
    </span>
  );
}

export function QuestionInline({
  request,
  answers,
  onChange,
  onReply,
  onReject,
}: {
  answers: string[][];
  onChange: (questionIndex: number, values: string[]) => void;
  onReject: () => void;
  onReply: () => void;
  request: QuestionRequest;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>(() =>
    Object.fromEntries(request.questions.map((question, index) => {
      const labels = new Set(question.options.map((option) => option.label));
      return [index, (answers[index] ?? []).find((answer) => !labels.has(answer)) ?? ""];
    }))
  );
  const customInputRef = useRef<HTMLInputElement>(null);
  const complete = request.questions.every((_, index) => (answers[index] ?? []).filter(Boolean).length > 0);
  const question = request.questions[activeIndex];
  const selected = answers[activeIndex] ?? [];
  const optionLabels = useMemo(
    () => new Set((question?.options ?? []).map((option) => option.label)),
    [question]
  );
  if (!question) return null;

  const multiple = question.multiple === true;
  const existingCustomAnswer = selected.find((answer) => !optionLabels.has(answer)) ?? "";
  const customValue = customAnswers[activeIndex] ?? existingCustomAnswer;
  const customSelected = Boolean(customValue.trim() && selected.includes(customValue.trim()));
  const customInputID = `${request.id}-custom-${activeIndex}`;

  const selectOption = (value: string) => {
    if (!multiple) {
      onChange(activeIndex, [value]);
      return;
    }
    onChange(
      activeIndex,
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  };

  const updateCustomAnswer = (value: string) => {
    const previous = customValue.trim();
    const next = value.trim();
    setCustomAnswers((current) => ({ ...current, [activeIndex]: value }));
    const withoutPrevious = previous ? selected.filter((item) => item !== previous) : selected;
    if (multiple) {
      onChange(activeIndex, next ? [...withoutPrevious, next] : withoutPrevious);
      return;
    }
    onChange(activeIndex, next ? [next] : []);
  };

  const toggleCustomAnswer = () => {
    const value = customValue.trim();
    if (!value) {
      customInputRef.current?.focus();
      return;
    }
    if (multiple) {
      onChange(
        activeIndex,
        customSelected ? selected.filter((item) => item !== value) : [...selected, value]
      );
      return;
    }
    onChange(activeIndex, customSelected ? [] : [value]);
  };

  return (
    <Confirmation approval={{ id: request.id }} className="mx-0 border-0 bg-muted/20 px-3 py-3 shadow-none" state="approval-requested">
      <ConfirmationRequest>
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <ConfirmationTitle className="font-medium text-foreground">{t("s_412dfd80db")}</ConfirmationTitle>
              <p className="mt-1 text-muted-foreground">{t("s_73bc5f4367")}</p>
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{activeIndex + 1}/{request.questions.length}</span>
          </div>

          <div className="flex flex-col gap-2" key={`${request.id}-${activeIndex}`}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{question.header || question.question}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{multiple ? t("s_83c68005f4") : t("s_3e886a9ca6")}</span>
            </div>
            {question.header && <p className="leading-5 text-muted-foreground">{question.question}</p>}

            <div aria-label={question.question} className="grid gap-0.5" role={multiple ? "group" : "radiogroup"}>
              {question.options.map((option) => {
                const isSelected = selected.includes(option.label);
                return (
                  <ConfirmationAction
                    aria-checked={isSelected}
                    className={cn(
                      "h-auto min-h-10 w-full justify-start gap-2.5 whitespace-normal rounded-md border-0 bg-transparent px-2.5 py-2 text-left shadow-none hover:bg-muted/55",
                      isSelected && "bg-muted/65"
                    )}
                    key={option.label}
                    onClick={() => selectOption(option.label)}
                    role={multiple ? "checkbox" : "radio"}
                    variant="ghost"
                  >
                    <SelectionMark multiple={multiple} selected={isSelected} />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{option.label}</span>
                      {option.description && <span className="mt-0.5 block text-[11px] font-normal leading-4 text-muted-foreground">{option.description}</span>}
                    </span>
                  </ConfirmationAction>
                );
              })}

              {question.custom !== false && (
                <div className={cn("grid min-h-10 grid-cols-[1rem_auto_minmax(0,1fr)] items-center gap-2.5 rounded-md px-2.5 py-1.5", customSelected && "bg-muted/65")}>
                  <button
                    aria-checked={customSelected}
                    aria-label={multiple ? t("s_9efd3a579e") : t("s_4cc72337e2")}
                    className="flex size-4 items-center justify-center"
                    onClick={toggleCustomAnswer}
                    role={multiple ? "checkbox" : "radio"}
                    type="button"
                  >
                    <SelectionMark multiple={multiple} selected={customSelected} />
                  </button>
                  <label className="whitespace-nowrap text-xs font-medium" htmlFor={customInputID}>{t("s_ef511fa77f")}</label>
                  <Input
                    className="h-8 border-border/50 bg-background/70 px-2.5 text-xs shadow-none focus-visible:ring-2"
                    id={customInputID}
                    onChange={(event) => updateCustomAnswer(event.target.value)}
                    placeholder={t("s_8eb84f93e2")}
                    ref={customInputRef}
                    value={customValue}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </ConfirmationRequest>

      <ConfirmationActions className="flex w-full flex-wrap items-center justify-between gap-2 self-stretch">
        <div className="flex items-center gap-1">
          <ConfirmationAction disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} variant="ghost"><ChevronLeft className="size-3.5" />{t("s_5cd36810d1")}</ConfirmationAction>
          {activeIndex < request.questions.length - 1 && <ConfirmationAction onClick={() => setActiveIndex((index) => Math.min(request.questions.length - 1, index + 1))} variant="ghost">{t("s_2d4c3791c5")}<ChevronRight className="size-3.5" /></ConfirmationAction>}
        </div>
        <div className="flex items-center gap-1">
          <ConfirmationAction onClick={onReject} variant="ghost">{t("s_1adb16f364")}</ConfirmationAction>
          <ConfirmationAction disabled={!complete} onClick={onReply}>{t("s_679645d268")}</ConfirmationAction>
        </div>
      </ConfirmationActions>
    </Confirmation>
  );
}
