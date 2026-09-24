import React from "react";
import { Info, ExternalLink } from "lucide-react";
import { CRAWLER_SITE_INFO } from "../types";

export interface CrawlerStatusNoticeProps {
  crawlers: string[];
}

export const CrawlerStatusNotice: React.FC<CrawlerStatusNoticeProps> = ({ crawlers }) => {
  return (
    <div className="pt-2 border-t border-slate-100 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 font-medium">已启用爬虫站点:</span>
          {crawlers.length > 0 ? (
            crawlers.map((c) => {
              const site = CRAWLER_SITE_INFO[c];
              const name = site?.name || c;
              const url = site?.url;

              return url ? (
                <a
                  key={c}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (typeof chrome !== "undefined" && chrome?.tabs?.create) {
                      e.preventDefault();
                      chrome.tabs.create({ url });
                    }
                  }}
                  title={`在新标签页打开 ${name} (${url})`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200/80 hover:border-indigo-300 font-mono font-medium text-[10px] transition cursor-pointer group"
                >
                  <span>{name}</span>
                  <ExternalLink
                    size={10}
                    className="text-slate-400 group-hover:text-indigo-500 transition-colors"
                  />
                </a>
              ) : (
                <span
                  key={c}
                  className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-medium text-[10px]"
                >
                  {name}
                </span>
              );
            })
          ) : (
            <span className="text-rose-500 font-medium">未启用任何爬虫</span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">
          可在「设置 &gt; 抓取与网络」管理启用的爬虫站点
        </span>
      </div>

      <div className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/70 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 leading-relaxed">
        <Info size={13} className="shrink-0 text-amber-600" />
        <span>
          在开启刮削任务前，建议手动访问一次以上网站（可直接点击上方标签直达）的任意影片详情页，通过年龄认证和CF人机认证，确保当前浏览器环境可正常使用以上网站。<br/>
          建议在刮削任务开始前，打开上述网站的任意页面在后台，不要关闭。
          工作时请不要关闭本页面，否则刮削任务会中断。
        </span>
      </div>
    </div>
  );
};
