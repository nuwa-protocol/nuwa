import type React from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface FixedCardLayoutProps {
	children: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
	title?: string;
	subtitle?: string;
	icon?: React.ReactNode;
}

export function FixedCardLayout({
	children,
	actions,
	className = "",
	title,
	subtitle,
	icon,
}: FixedCardLayoutProps) {
	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
			<div
				className={cn(
					"w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden",
					"aspect-[3/4] flex flex-col", // Fixed 3:4 aspect ratio
					className,
				)}
			>
				{/* Header area */}
				{(title || subtitle || icon) && (
					<div className="px-8 pt-8 pb-4 text-center">
						{icon && <div className="mb-4 flex justify-center">{icon}</div>}
						{title && (
							<h2 className="text-2xl font-semibold text-gray-900 mb-2">
								{title}
							</h2>
						)}
						{subtitle && <p className="text-gray-600 text-sm">{subtitle}</p>}
					</div>
				)}

				{/* Content area - scrollable */}
				<div className="px-8 flex-1 overflow-y-auto">{children}</div>

				{/* Bottom action button area */}
				{actions && (
					<div className="px-8 py-6 border-t border-gray-100 bg-gray-50/50">
						<div className="flex flex-col gap-3">{actions}</div>
					</div>
				)}
			</div>
		</div>
	);
}

interface FixedCardActionsProps {
	children: React.ReactNode;
}

export function FixedCardActions({ children }: FixedCardActionsProps) {
	return <div className="flex flex-col gap-3 w-full">{children}</div>;
}

interface FixedCardActionButtonProps {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	variant?: "default" | "outline" | "destructive" | "secondary";
	loading?: boolean;
	type?: "button" | "submit";
	size?: "default" | "sm" | "lg";
}

export function FixedCardActionButton({
	children,
	onClick,
	disabled,
	variant = "default",
	loading,
	type = "button",
	size = "default",
}: FixedCardActionButtonProps) {
	return (
		<Button
			className={cn(
				"w-full font-medium",
				size === "lg" && "h-12 text-base",
				size === "sm" && "h-9 text-sm",
			)}
			variant={variant}
			onClick={onClick}
			disabled={disabled || loading}
			type={type}
			size={size}
		>
			{loading ? (
				<div className="flex items-center gap-2">
					<Spinner size="small" />
					<span>Loading...</span>
				</div>
			) : (
				children
			)}
		</Button>
	);
}

// Loading state component for the layout
interface FixedCardLoadingProps {
	title?: string;
	message?: string;
}

export function FixedCardLoading({
	title = "Loading...",
	message = "Please wait...",
}: FixedCardLoadingProps) {
	return (
		<FixedCardLayout>
			<div className="flex flex-col items-center justify-center h-full text-center">
				<Spinner size="large" className="mb-4" />
				<h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
				<p className="text-gray-600 text-sm">{message}</p>
			</div>
		</FixedCardLayout>
	);
}
