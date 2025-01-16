/*
  Warnings:

  - A unique constraint covering the columns `[ymd,user]` on the table `state` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "state_ymd_user_key" ON "state"("ymd", "user");
