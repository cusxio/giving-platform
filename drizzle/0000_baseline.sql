CREATE TABLE "funds" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text,
	"id" varchar(12) PRIMARY KEY NOT NULL,
	"name" varchar(254) NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"message" varchar(255),
	"paid_at" timestamp with time zone,
	"payment_method" varchar(10),
	"provider" text DEFAULT 'eghl' NOT NULL,
	"provider_transaction_id" text,
	"transaction_id" varchar(21) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_attempts" (
	"action" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(50) NOT NULL,
	"token_type" varchar(3) NOT NULL,
	"user_id" integer NOT NULL,
	"card_holder" varchar(30),
	"card_no_mask" varchar(19) NOT NULL,
	"card_exp" varchar(6) NOT NULL,
	"card_type" varchar(10) NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"used_at" timestamp with time zone,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"amount" integer NOT NULL,
	"fund_id" varchar(12) NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" varchar(21) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"amount" integer NOT NULL,
	"created_as" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"privacy_mode" boolean DEFAULT false NOT NULL,
	"user_id" integer PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"first_name" varchar(32),
	"last_name" varchar(32),
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'guest' NOT NULL,
	"journey" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_payment_methods" ADD CONSTRAINT "saved_payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funds_name_idx" ON "funds" USING btree ("name");--> statement-breakpoint
CREATE INDEX "payments_transaction_id_idx" ON "payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_attempts_identifier_action_idx" ON "rate_limit_attempts" USING btree ("identifier","action");--> statement-breakpoint
CREATE INDEX "saved_payment_methods_user_id_card_exp_last_used_idx" ON "saved_payment_methods" USING btree ("user_id","card_exp","last_used_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_payment_methods_user_id_card_no_mask_card_exp_idx" ON "saved_payment_methods" USING btree ("user_id","card_no_mask","card_exp");--> statement-breakpoint
CREATE INDEX "saved_payment_methods_token_idx" ON "saved_payment_methods" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_token_hash_user_id_idx" ON "tokens" USING btree ("token_hash","user_id");--> statement-breakpoint
CREATE INDEX "tokens_user_id_expires_at_used_at_created_at_idx" ON "tokens" USING btree ("user_id","expires_at","used_at","created_at");--> statement-breakpoint
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_items_transaction_id_fund_id_amount_idx" ON "transaction_items" USING btree ("transaction_id","fund_id","amount");--> statement-breakpoint
CREATE INDEX "transactions_user_id_status_created_at_idx" ON "transactions" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "transactions_user_id_status_created_as_created_at_idx" ON "transactions" USING btree ("user_id","status","created_as","created_at");--> statement-breakpoint
CREATE INDEX "transactions_status_created_at_idx" ON "transactions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "transactions_user_id_created_as_idx" ON "transactions" USING btree ("user_id","created_as");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");