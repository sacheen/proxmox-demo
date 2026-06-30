CREATE TABLE `pings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_id` integer NOT NULL,
	`status` text NOT NULL,
	`latency_ms` integer,
	`pinged_at` integer NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL
);
