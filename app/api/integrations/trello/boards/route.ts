
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTrelloClientForUser } from "@/lib/trello";

export async function GET(req: NextRequest) {
    const { userId } = auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const trello = await getTrelloClientForUser(userId);

        if (!trello) {
            return NextResponse.json({ error: "Trello not connected" }, { status: 404 });
        }

        const boards = await trello.getBoards();
        return NextResponse.json(boards);

    } catch (error: any) {
        console.error("[Trello Boards] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
