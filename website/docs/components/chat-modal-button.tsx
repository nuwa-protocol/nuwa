"use client";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircleIcon, XIcon } from "lucide-react";
import Chat from "./chat";
import Image from "next/image";

const ChatModalButton = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <MessageCircleIcon className="w-4 h-4" />
          <span className="text-sm">Ask Nuwa Guide</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="min-h-[calc(100vh-200px)] sm:min-w-[calc(100vh-200px)] bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0] dark:from-[#1e293b] dark:to-[#0f172a] rounded-2xl shadow-lg border border-[#e5e7eb] dark:border-[#334155] [&>button:last-child]:hidden">
        <DialogHeader className="relative">
          <DialogTitle>
            <span className="flex items-center gap-2 rounded-full">
              <Image
                src="/logos/logo-gradient2.png"
                alt="Nuwa App Icon"
                width={24}
                height={24}
                className="rounded-full"
              />
              Nuwa Guide GPT
            </span>
          </DialogTitle>
          <DialogDescription className="text-left">
            Ask questions about Nuwa here.
          </DialogDescription>
          <DialogClose asChild>
            <button
              type="button"
              className="absolute top-0 right-0 p-2 rounded-full text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </DialogClose>
        </DialogHeader>
        <Chat />
      </DialogContent>
    </Dialog>
  );
};

export default ChatModalButton;
