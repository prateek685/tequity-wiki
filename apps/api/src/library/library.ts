import { Controller, Get, Injectable, Module } from "@nestjs/common";
import {
  cardPublic,
  LIBRARY_KINDS,
  libraryEntry,
  type LibraryResponse,
  libraryResponse,
  type Me,
} from "@portal/contracts";
import { CurrentUser } from "../auth/decorators.js";
import { asContract } from "../common/contract.js";
import { storedDay } from "../content/lesson.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * The Library (GET /api/library): frameworks, templates, AI prompts, the glossary, resources, and every
 * mock card's public side with the first day that uses it. Content only (no one's data); the AI prompts
 * of mock cards stay private (content_card_prompts is never read here).
 */
@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<LibraryResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const rows = await tx.contentLibraryEntry.findMany({ select: { data: true } });
      const entries = rows
        .map((row) => libraryEntry.parse(row.data))
        .sort(
          (a, b) =>
            LIBRARY_KINDS.indexOf(a.kind) - LIBRARY_KINDS.indexOf(b.kind) ||
            (a.ref ?? a.title).localeCompare(b.ref ?? b.title, "en", { numeric: true }),
        );
      const cards = await tx.contentCard.findMany({ orderBy: { id: "asc" }, select: { data: true } });
      const days = await tx.contentDay.findMany({
        orderBy: { day: "asc" },
        select: { day: true, data: true },
      });
      const firstDay = new Map<string, number>();
      for (const row of days) {
        for (const item of storedDay.parse(row.data).lessons) {
          for (const id of [item.cardId, item.substituteCardId]) {
            if (id && !firstDay.has(id)) firstDay.set(id, row.day);
          }
        }
      }
      return asContract(libraryResponse, {
        entries,
        cards: cards.map((row) => {
          const card = cardPublic.parse(row.data);
          return { ...card, day: firstDay.get(card.id) ?? null };
        }),
      });
    });
  }
}

/** Any signed-in user (engineers, managers, admins). */
@Controller("library")
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  get(@CurrentUser() user: Me): Promise<LibraryResponse> {
    return this.library.get(user.id);
  }
}

@Module({ controllers: [LibraryController], providers: [LibraryService] })
export class LibraryModule {}
