"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, RefreshCw, Download, AlertTriangle, Info, XCircle } from "lucide-react";
import { format } from "date-fns";

type Log = {
    id: string;
    timestamp: string;
    level: string;
    message: string;
    source: string;
    metadata: any;
};

export default function LogsPage() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterLevel, setFilterLevel] = useState<string>("all");
    const [isLive, setIsLive] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Initial Fetch
    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            let query = supabase
                .from("logs")
                .select("*")
                .order("timestamp", { ascending: false })
                .limit(100);

            if (filterLevel !== "all") {
                query = query.eq("level", filterLevel);
            }

            const { data, error } = await query;
            if (!error && data) {
                setLogs(data);
            }
            setLoading(false);
        };

        fetchLogs();
    }, [filterLevel]);

    // Real-time Subscription
    useEffect(() => {
        if (!isLive) return;

        const channel = supabase
            .channel("realtime-logs")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "logs",
                },
                (payload: any) => {
                    const newLog = payload.new as Log;
                    if (filterLevel === "all" || newLog.level === filterLevel) {
                        setLogs((prev) => [newLog, ...prev].slice(0, 100));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isLive, filterLevel]);

    const exportLogs = (formatType: 'csv' | 'json' | 'md') => {
        const content = formatType === 'json'
            ? JSON.stringify(logs, null, 2)
            : formatType === 'csv'
                ? "Timestamp,Level,Source,Message\n" + logs.map(l => `${l.timestamp},${l.level},${l.source},"${l.message.replace(/"/g, '""')}"`).join("\n")
                : "# Log Export\n\n" + logs.map(l => `## [${l.level.toUpperCase()}] ${l.timestamp}\n**Source:** ${l.source}\n**Message:** ${l.message}\n`).join("\n---\n");

        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `logs-export-${format(new Date(), "yyyy-MM-dd-HHmm")}.${formatType}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setShowExportMenu(false);
    };

    const getLevelIcon = (level: string) => {
        switch (level.toLowerCase()) {
            case "error": return <XCircle className="text-red-500 w-4 h-4" />;
            case "warning": return <AlertTriangle className="text-yellow-500 w-4 h-4" />;
            default: return <Info className="text-blue-500 w-4 h-4" />;
        }
    };

    const getLevelClass = (level: string) => {
        switch (level.toLowerCase()) {
            case "error": return "bg-red-50 border-red-200 text-red-700";
            case "warning": return "bg-yellow-50 border-yellow-200 text-yellow-700";
            default: return "bg-blue-50 border-blue-200 text-blue-700";
        }
    };

    return (
        <div className="h-full bg-gray-50 overflow-auto">
            {/* Sticky header with title + actions */}
            <div className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur-md border-b px-3 sm:px-6 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg sm:text-2xl font-bold tracking-tight">System Logs</h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsLive(!isLive)}
                            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm transition-colors ${isLive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-white border text-gray-600'}`}
                        >
                            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isLive ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{isLive ? 'Live On' : 'Live'}</span>
                        </button>

                        {/* Mobile: export icon menu */}
                        <div className="sm:hidden relative">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-white border text-gray-600"
                            >
                                <Download className="w-3 h-3" />
                            </button>
                            {showExportMenu && (
                                <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg py-1 z-20">
                                    <button onClick={() => exportLogs('csv')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100">CSV</button>
                                    <button onClick={() => exportLogs('json')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100">JSON</button>
                                    <button onClick={() => exportLogs('md')} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100">MD</button>
                                </div>
                            )}
                        </div>

                        {/* Desktop: export buttons */}
                        <div className="hidden sm:flex items-center bg-white border rounded-md p-1">
                            <button onClick={() => exportLogs('csv')} className="px-3 py-1 text-sm hover:bg-gray-100 rounded">CSV</button>
                            <button onClick={() => exportLogs('json')} className="px-3 py-1 text-sm hover:bg-gray-100 rounded">JSON</button>
                            <button onClick={() => exportLogs('md')} className="px-3 py-1 text-sm hover:bg-gray-100 rounded">MD</button>
                        </div>
                    </div>
                </div>

                {/* Filter select */}
                <div className="flex items-center gap-2">
                    <select
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                        className="px-2 py-1.5 rounded border bg-white text-xs sm:text-sm"
                    >
                        <option value="all">All Levels</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                    </select>
                    <span className="text-xs text-gray-500">Showing last 100 logs</span>
                </div>
            </div>

            {/* Content: cards on mobile, table on desktop */}
            <div className="p-3 sm:p-6">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">No logs found.</div>
                ) : (
                    <>
                        {/* Mobile: stacked cards */}
                        <div className="sm:hidden space-y-2">
                            {logs.map((log) => (
                                <div key={log.id} className="bg-white rounded-lg border p-3 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getLevelClass(log.level)}`}>
                                            {getLevelIcon(log.level)}
                                            {log.level.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-gray-500">{format(new Date(log.timestamp), "MMM d, HH:mm:ss")}</span>
                                    </div>
                                    <div className="text-xs font-mono text-gray-500">{log.source || 'system'}</div>
                                    <div className="text-sm text-gray-700 break-words">{log.message}</div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop: table */}
                        <div className="hidden sm:block bg-white rounded-lg shadow border overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-6 py-3">Timestamp</th>
                                            <th className="px-6 py-3">Level</th>
                                            <th className="px-6 py-3">Source</th>
                                            <th className="px-6 py-3">Message</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="bg-white border-b hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                    {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelClass(log.level)}`}>
                                                        {getLevelIcon(log.level)}
                                                        {log.level.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-mono text-gray-500 text-xs">
                                                    {log.source || 'system'}
                                                </td>
                                                <td className="px-6 py-4 max-w-xl truncate" title={log.message}>
                                                    {log.message}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
