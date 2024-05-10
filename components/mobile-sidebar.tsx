"use client";

import { Button } from "./ui/button";
import { DropdownMenuIcon } from "@radix-ui/react-icons";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import Sidebar from "./sidebar";
import { useEffect, useState } from "react";

const MobileSidebar = () => {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }
    
    return (
        <Sheet>
            <SheetTrigger>
                <Button variant={"ghost"} size={"icon"} className="md:hidden">
                 <DropdownMenuIcon />
                </Button>
            </SheetTrigger>
            <SheetContent side={"left"} className="p-0">
                <Sidebar />
            </SheetContent>
        </Sheet>
    );
}

export default MobileSidebar;