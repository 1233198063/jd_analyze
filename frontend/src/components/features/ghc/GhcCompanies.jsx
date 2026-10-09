import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import Badge from "@/components/common/Badge";
import Icon from "@/components/common/Icon";

const FIT_TABS = [
  { fit: "focus", label: "重点", hint: "先联系，一定要去" },
  { fit: "worth", label: "值得聊", hint: "有空就去" },
  { fit: "long_shot", label: "低优先", hint: "地点 / 技术栈 / 担保不太对口" },
  { fit: "skip", label: "跳过", hint: "要求公民身份，或不是雇主" },
];

const SPONSOR = {
  strong: { label: "H-1B 稳定", variant: "green" },
  some: { label: "H-1B 有记录", variant: "yellow" },
  unclear: { label: "H-1B 待确认", variant: "gray" },
  no: { label: "需公民 / ITAR", variant: "red" },
};

export const COMPANY_STATUSES = [
  { value: "", label: "未开始", dot: "bg-ink/15" },
  { value: "applied", label: "已网申", dot: "bg-gold-400" },
  { value: "reached_out", label: "已联系", dot: "bg-plum-400" },
  { value: "met", label: "booth 见过", dot: "bg-petrol-400" },
  { value: "interview", label: "拿到面试", dot: "bg-sage-500" },
  { value: "passed", label: "不考虑", dot: "bg-ink/30" },
];

const APP_STATUS = {
  saved: "Saved",
  applied: "已投递",
  referral_asked: "已求内推",
  oa: "OA",
  phone_screen: "电话面",
  interview: "面试中",
  offer: "Offer",
  rejected: "已拒",
  withdrawn: "已撤回",
};

function JobLinks({ jobs }) {
  const [showRejected, setShowRejected] = useState(false);
  const open = jobs.filter((j) => !j.auto_rejected);
  const rejected = jobs.filter((j) => j.auto_rejected);
  if (!jobs.length) return null;
  const shown = showRejected ? jobs : open;
  return (
    <div className="mt-2 text-xs">
      <p className="text-ink/45 mb-1">你库里的岗位</p>
      <ul className="space-y-0.5">
        {shown.map((j) => (
          <li key={j.id} className="flex items-baseline gap-2">
            <Link
              to={`/jobs/${j.id}`}
              className={clsx("hover:underline truncate", j.auto_rejected ? "text-ink/40" : "text-petrol-600")}
            >
              {j.title}
            </Link>
            <span className="text-ink/40 whitespace-nowrap">
              {j.auto_rejected ? "auto-rejected" : `${j.score} 分`}
              {j.application_status && ` · ${APP_STATUS[j.application_status] ?? j.application_status}`}
            </span>
          </li>
        ))}
      </ul>
      {rejected.length > 0 && (
        <button className="text-ink/40 hover:text-ink/70 mt-0.5" onClick={() => setShowRejected((v) => !v)}>
          {showRejected ? "收起 auto-rejected" : `另有 ${rejected.length} 个 auto-rejected`}
        </button>
      )}
    </div>
  );
}

function CompanyRow({ company, onSave }) {
  const [note, setNote] = useState(company.note ?? "");
  const sponsor = SPONSOR[company.sponsor];
  const status = COMPANY_STATUSES.find((s) => s.value === (company.status ?? ""));
  const muted = company.fit === "skip" || company.status === "passed";

  return (
    <div className={clsx("card p-4", muted && "opacity-70")}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-ink">{company.name}</h3>
            <Badge variant={company.tier === "Enterprise" ? "blue" : "gray"}>{company.tier}</Badge>
            <Badge variant={sponsor.variant}>{sponsor.label}</Badge>
            {company.uscis != null && (
              <span
                className="text-xs text-ink/40"
                title="USCIS H-1B Employer Data Hub FY2023 导出文件中的批准数（initial + continuing）。这是非全年文件，只说明这家公司在办 H-1B，不代表名额。"
              >
                USCIS FY23 · {company.uscis.toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-xs text-ink/55 mt-1">
            <Icon name="location_on" size={13} className="mr-0.5" />
            {company.locations}
          </p>
        </div>
        {company.fit !== "skip" && (
          <label className="flex items-center gap-1.5 text-xs">
            <span className={clsx("w-2 h-2 rounded-full", status.dot)} />
            <select
              className="input w-32 py-1 text-xs"
              value={company.status ?? ""}
              onChange={(e) => onSave({ status: e.target.value })}
            >
              {COMPANY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {company.fit !== "skip" && (
        <p className="text-sm text-ink/80 mt-2">
          <span className="text-ink/45">问这些岗位：</span>
          {company.roles}
        </p>
      )}
      <p className="text-sm text-ink/65 mt-1">{company.why}</p>

      <JobLinks jobs={company.jobs} />

      {company.fit !== "skip" && (
        <input
          className="input mt-3 py-1.5 text-xs"
          placeholder="备注：job ID、联系人、聊了什么、答应了什么……"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (company.note ?? "") && onSave({ note })}
        />
      )}
    </div>
  );
}

export default function GhcCompanies({ companies, onSave }) {
  const [fit, setFit] = useState("focus");
  const shown = companies.filter((c) => c.fit === fit);
  const focus = companies.filter((c) => c.fit === "focus");
  const counts = COMPANY_STATUSES.filter((s) => s.value && s.value !== "passed")
    .map((s) => ({ ...s, n: focus.filter((c) => c.status === s.value).length }));

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-ink">参展公司：哪些适合你</h2>
          <p className="text-xs text-ink/50 mt-0.5">
            官网 Partners 页 10/6 的名单：12 家 Enterprise、16 家 Premium、约 50 家参与赞助。按你的条件分组：early-career 前端 / 全栈 / AI 应用、湾区优先、需要 H-1B。
          </p>
        </div>
        <p className="text-xs text-ink/55 flex gap-3 flex-wrap">
          <span className="text-ink/40">重点 {focus.length} 家：</span>
          {counts.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1">
              <span className={clsx("w-2 h-2 rounded-full", s.dot)} />
              {s.label} {s.n}
            </span>
          ))}
        </p>
      </div>

      <div className="flex gap-1 bg-white border border-mist rounded-lg p-1 w-fit flex-wrap">
        {FIT_TABS.map((t) => (
          <button
            key={t.fit}
            onClick={() => setFit(t.fit)}
            title={t.hint}
            className={clsx(
              "px-3 py-1.5 rounded-md text-sm transition-colors",
              fit === t.fit ? "bg-petrol-500 text-white font-medium" : "text-ink/60 hover:bg-petrol-50"
            )}
          >
            {t.label}
            <span className={clsx("ml-1.5 text-xs", fit === t.fit ? "text-white/70" : "text-ink/35")}>
              {companies.filter((c) => c.fit === t.fit).length}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-ink/45 -mt-1">{FIT_TABS.find((t) => t.fit === fit).hint}</p>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {shown.map((c) => (
          <CompanyRow key={c.key} company={c} onSave={(payload) => onSave(`company:${c.key}`, payload)} />
        ))}
      </div>
    </section>
  );
}
