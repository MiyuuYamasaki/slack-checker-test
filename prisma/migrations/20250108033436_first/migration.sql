-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record" (
    "id" SERIAL NOT NULL,
    "ymd" TEXT NOT NULL,
    "selected_status" TEXT NOT NULL,
    "leave_check" INTEGER NOT NULL DEFAULT 0,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state" (
    "id" SERIAL NOT NULL,
    "ymd" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "channel" TEXT NOT NULL,

    CONSTRAINT "state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_user_id_key" ON "users"("slack_user_id");
