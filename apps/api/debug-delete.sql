SELECT
  (SELECT COUNT(*) FROM "Message" WHERE "authorId" = 'cmjqzpvl10000vgq03z9aa4kr') AS messages_authored,
  (SELECT COUNT(*) FROM "Message" WHERE "deletedById" = 'cmjqzpvl10000vgq03z9aa4kr') AS messages_deletedby,
  (SELECT COUNT(*) FROM "ChannelRead" WHERE "userId" = 'cmjqzpvl10000vgq03z9aa4kr') AS channel_reads,
  (SELECT COUNT(*) FROM "MessageMention" WHERE "userId" = 'cmjqzpvl10000vgq03z9aa4kr') AS mentions,
  (SELECT COUNT(*) FROM "MessageReaction" WHERE "userId" = 'cmjqzpvl10000vgq03z9aa4kr') AS reactions,
  (SELECT COUNT(*) FROM "EmailVerificationToken" WHERE "userId" = 'cmjqzpvl10000vgq03z9aa4kr') AS email_tokens;
