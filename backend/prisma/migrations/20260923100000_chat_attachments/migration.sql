-- Chat attachments (messaging overhaul Phase 3): one photo, document or
-- voice note per message, in DMs and study rooms.
ALTER TABLE "DirectMessage" ADD COLUMN "attachPath" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "attachKind" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "attachName" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "attachMime" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "attachSize" INTEGER;
ALTER TABLE "DirectMessage" ADD COLUMN "attachSeconds" INTEGER;

ALTER TABLE "StudyRoomMessage" ADD COLUMN "attachPath" TEXT;
ALTER TABLE "StudyRoomMessage" ADD COLUMN "attachKind" TEXT;
ALTER TABLE "StudyRoomMessage" ADD COLUMN "attachName" TEXT;
ALTER TABLE "StudyRoomMessage" ADD COLUMN "attachMime" TEXT;
ALTER TABLE "StudyRoomMessage" ADD COLUMN "attachSize" INTEGER;
ALTER TABLE "StudyRoomMessage" ADD COLUMN "attachSeconds" INTEGER;
