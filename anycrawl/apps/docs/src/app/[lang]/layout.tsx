import "fumadocs-ui/style.css";
import "../global.css";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

const inter = Inter({
    subsets: ["latin"],
});

export default async function Layout({
    params,
    children,
}: {
    params: Promise<{ lang: string }>;
    children: ReactNode;
}) {
    const { lang } = await params;
    return (
        <html lang={lang} className={inter.className} suppressHydrationWarning>
            <body
                style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100vh",
                }}
            >
                <RootProvider
                    i18n={{
                        locale: lang,
                        locales: [
                            {
                                name: "English",
                                locale: "en",
                            },
                            {
                                name: "简体中文",
                                locale: "zh-cn",
                            },
                            {
                                name: "繁體中文",
                                locale: "zh-tw",
                            },
                        ],
                        translations: {
                            "zh-tw": {
                                toc: "目錄",
                                search: "搜尋文檔",
                                lastUpdate: "最後更新於",
                                searchNoResult: "沒有結果",
                                previousPage: "上一頁",
                                nextPage: "下一頁",
                                chooseLanguage: "選擇語言",
                            },
                            "zh-cn": {
                                toc: "目录",
                                search: "搜索文档",
                                lastUpdate: "最后更新于",
                                searchNoResult: "没有结果",
                                previousPage: "上一页",
                                nextPage: "下一页",
                                chooseLanguage: "选择语言",
                            },
                        }[lang],
                    }}
                >
                    {children}
                </RootProvider>
            </body>
        </html>
    );
}
