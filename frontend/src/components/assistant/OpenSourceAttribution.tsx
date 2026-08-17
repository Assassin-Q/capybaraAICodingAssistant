import { ExternalLink, Github, GitBranch, UserRound } from "lucide-react";

import { t } from "@/lib/i18n";

const PROJECT_GITHUB_URL = "https://github.com/Assassin-Q/capybaraAICodingAssistant";
const PROJECT_GITEE_URL = "https://gitee.com/qianguanshui/capybaraAICodingAssistant";
const AUTHOR_GITHUB_URL = "https://github.com/Assassin-Q";
const AUTHOR_GITEE_URL = "https://gitee.com/qianguanshui";

interface SourceLinkProps {
  href: string;
  label: string;
}

function SourceLink({ href, label }: SourceLinkProps) {
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
      <ExternalLink className="size-3" />
    </a>
  );
}

export function OpenSourceAttribution() {
  return (
    <section aria-labelledby="open-source-attribution-title">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-1 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="open-source-attribution-title">{t("opensource.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("opensource.description")}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 gap-3">
          <Github className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("opensource.project")}</p>
            <p className="mt-1 truncate text-sm font-medium">Capybara AI Coding Assistant</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <SourceLink href={PROJECT_GITHUB_URL} label="GitHub" />
              <SourceLink href={PROJECT_GITEE_URL} label="Gitee" />
            </div>
          </div>
        </div>

        <div className="flex min-w-0 gap-3">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("opensource.author")}</p>
            <p className="mt-1 truncate text-sm font-medium">Assassin-Q · qianguanshui</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <SourceLink href={AUTHOR_GITHUB_URL} label="GitHub" />
              <SourceLink href={AUTHOR_GITEE_URL} label="Gitee" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">{t("opensource.license")}</p>
    </section>
  );
}
