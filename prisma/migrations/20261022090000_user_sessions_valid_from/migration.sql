-- إبطال الجلسات القديمة عند تغيير كلمة المرور
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
