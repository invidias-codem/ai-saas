"use client";

import useSWR from "swr";
import { getCreditsAction } from "@/app/actions/credits";

const fetcher = async () => {
    return await getCreditsAction();
};

export const useCredits = () => {
    const { data, error, mutate } = useSWR("user-credits", fetcher, {
        refreshInterval: 30000, // Refresh every 30s
    });

    return {
        credits: data ?? 0,
        isLoading: !data && !error,
        isError: error,
        mutate,
    };
};
