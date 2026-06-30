/**
 * ICPE Mission — seed script
 * Run: npx ts-node -r tsconfig-paths/register prisma/seed.ts
 * Requires DATABASE_URL in ../.env
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_PRICING } from '../src/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ICPE database...');

  // ── Organization ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: 'icpe-org' },
    update: {},
    create: {
      id: 'icpe-org',
      name: 'ICPE Mission Polska',
      currency: 'PLN',
      bankDetails: {
        iban: 'PL00 1234 5678 9012 3456 7890 1234',
        bankName: 'PKO Bank Polski',
        accountHolder: 'ICPE Mission Polska',
      },
      branding: { primaryColor: '#1a56db', logo: null },
    },
  });
  console.log('  org:', org.name);

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminHash = await argon2.hash('admin123');
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@icpemission.pl' },
    update: {},
    create: {
      email: 'admin@icpemission.pl',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      locale: 'pl',
    },
  });
  console.log('  admin:', admin.email);

  // ── Event Series + Instance (Dzień Formacji 2026) ─────────────────────────
  const series = await prisma.eventSeries.create({
    data: {
      type: 'ONE_TIME',
      instances: {
        create: {
          title: {
            pl: 'Dzień Formacji 2026',
            en: 'Formation Day 2026',
            it: 'Giorno di Formazione 2026',
          },
          description: {
            pl: 'Jednodniowy wyjazd formacyjny ICPE Mission w Ożarowie Mazowieckim.',
            en: 'ICPE Mission one-day formation retreat in Ożarów Mazowiecki.',
            it: 'Ritiro formativo di un giorno di ICPE Mission a Ożarów Mazowiecki.',
          },
          startsAt: new Date('2026-09-04T14:00:00Z'),
          endsAt: new Date('2026-09-05T12:00:00Z'),
          location: 'Ożarów Mazowiecki, ul. Poznańska 1',
          nights: 1,
          capacity: 80,
          status: 'OPEN',
          registrationOpensAt: new Date('2026-07-01T00:00:00Z'),
          registrationClosesAt: new Date('2026-08-25T23:59:59Z'),
          paymentMethods: ['ONLINE', 'BANK_TRANSFER'],
          pricingConfig: DEFAULT_PRICING,
        },
      },
    },
    include: { instances: true },
  });

  const instance = series.instances[0];
  console.log('  instance:', (instance.title as Record<string,string>)['pl'], instance.id);

  // ── Registration Page ─────────────────────────────────────────────────────
  const page = await prisma.registrationPage.create({
    data: {
      seriesId: series.id,
      slug: 'dzien-formacji-2026',
      isEvergreen: false,
      theme: { primaryColor: '#1a56db', heroImage: null },
      enabledFields: { phone: true, address: true, dietary: true, children: true },
      locales: ['pl', 'en', 'it'],
      published: true,
    },
  });
  console.log('  page slug:', page.slug);

  // ── Room types ─────────────────────────────────────────────────────────────
  const rt2os = await prisma.roomType.create({
    data: {
      instanceId: instance.id,
      name: { pl: 'Miejsce w pokoju 2-osobowym', en: 'Place in twin room', it: 'Posto in camera doppia' },
      capacity: 2,
      pricingModel: 'PER_PERSON_PER_NIGHT',
      price: 80,
      genderPolicy: 'ANY',
      quantity: 20,
    },
  });

  const rt1os = await prisma.roomType.create({
    data: {
      instanceId: instance.id,
      name: { pl: 'Pokój 1-osobowy', en: 'Single room', it: 'Camera singola' },
      capacity: 1,
      pricingModel: 'PER_PERSON_PER_NIGHT',
      price: 100,
      genderPolicy: 'ANY',
      quantity: 10,
    },
  });

  const rtFamily = await prisma.roomType.create({
    data: {
      instanceId: instance.id,
      name: { pl: 'Pokój rodzinny (4 os.)', en: 'Family room (4 pax)', it: 'Camera familiare (4 pers.)' },
      capacity: 4,
      pricingModel: 'PER_PERSON_PER_NIGHT',
      price: 70,
      genderPolicy: 'FAMILY',
      quantity: 5,
    },
  });
  console.log('  room types: 3 created');

  // ── Room pool (sample — 5 of each for seed) ───────────────────────────────
  for (let i = 1; i <= 5; i++) {
    await prisma.room.create({ data: { instanceId: instance.id, roomTypeId: rt2os.id, label: `2os-${i}`, capacity: 2 } });
    await prisma.room.create({ data: { instanceId: instance.id, roomTypeId: rt1os.id, label: `1os-${i}`, capacity: 1 } });
    await prisma.room.create({ data: { instanceId: instance.id, roomTypeId: rtFamily.id, label: `fam-${i}`, capacity: 4 } });
  }
  console.log('  rooms: 15 created (5 per type)');

  // ── Sample registrations ───────────────────────────────────────────────────
  const sampleRegs = [
    { firstName: 'Anna', lastName: 'Kowalska', email: 'anna.kowalska@example.pl', adults: 1, children: 0, roomTypeId: rt1os.id, method: 'BANK_TRANSFER', status: 'AWAITING_TRANSFER' },
    { firstName: 'Piotr', lastName: 'Wiśniewski', email: 'piotr.wisniewski@example.pl', adults: 2, children: 0, roomTypeId: rt2os.id, method: 'ONLINE', status: 'CONFIRMED' },
    { firstName: 'Marta', lastName: 'Nowak', email: 'marta.nowak@example.pl', adults: 2, children: 2, roomTypeId: rtFamily.id, method: 'BANK_TRANSFER', status: 'CONFIRMED' },
    { firstName: 'Tomasz', lastName: 'Zając', email: 'tomasz.zajac@example.pl', adults: 1, children: 0, roomTypeId: rt2os.id, method: 'ONLINE', status: 'PENDING_PAYMENT' },
    { firstName: 'Katarzyna', lastName: 'Dąbrowska', email: 'katarzyna.dabrowska@example.pl', adults: 2, children: 1, roomTypeId: rtFamily.id, method: 'BANK_TRANSFER', status: 'AWAITING_TRANSFER' },
    { firstName: 'Marek', lastName: 'Lewandowski', email: 'marek.lewandowski@example.pl', adults: 1, children: 0, roomTypeId: rt1os.id, method: 'ONLINE', status: 'CONFIRMED' },
    { firstName: 'Agnieszka', lastName: 'Wójcik', email: 'agnieszka.wojcik@example.pl', adults: 2, children: 3, roomTypeId: rtFamily.id, method: 'BANK_TRANSFER', status: 'WAITLIST' },
  ] as const;

  const { computePrice } = await import('../src/shared');

  for (const reg of sampleRegs) {
    const participants: Array<{ type: 'adult' | 'child'; age: number }> = [
      ...Array.from({ length: reg.adults }, () => ({ type: 'adult' as const, age: 30 })),
      ...Array.from({ length: reg.children }, (_, i) => ({ type: 'child' as const, age: 5 + i * 2 })),
    ];

    const roomId = reg.roomTypeId === rt1os.id ? 'single'
                 : reg.roomTypeId === rtFamily.id ? 'family'
                 : 'double';

    const price = computePrice({ rooms: [{ roomId, participants }] });

    await prisma.registration.create({
      data: {
        instanceId: instance.id,
        locale: 'pl',
        status: reg.status,
        contact: { firstName: reg.firstName, lastName: reg.lastName, email: reg.email, phone: '+48600000000' },
        preferredRoomTypeId: reg.roomTypeId,
        totalPrice: price.total,
        currency: 'PLN',
        paymentMethod: reg.method,
        participants: {
          create: participants.map((p, i) => ({
            type: p.type === 'adult' ? 'ADULT' : 'CHILD',
            firstName: i === 0 ? reg.firstName : `Dziecko ${i}`,
            lastName: reg.lastName,
            age: p.age,
            gender: 'OTHER',
          })),
        },
      },
    });
  }
  console.log('  registrations: 7 sample registrations created');

  // ── Standalone event (bez noclegu, bezpłatny, RSVP) ───────────────────────
  const standalone = await prisma.eventSeries.create({
    data: {
      type: 'STANDALONE',
      instances: {
        create: {
          title: {
            pl: 'Spotkanie otwarte ICPE',
            en: 'ICPE Open Evening',
            it: 'Serata aperta ICPE',
          },
          description: {
            pl: 'Wieczór uwielbienia i świadectw — wstęp wolny. Potwierdź obecność.',
            en: 'Worship and testimonies evening — free entry. Please RSVP.',
            it: 'Serata di lode e testimonianze — ingresso libero. Conferma la presenza.',
          },
          startsAt: new Date('2026-07-18T17:00:00Z'),
          endsAt: new Date('2026-07-18T20:00:00Z'),
          location: 'Parafia św. Anny, ul. Główna 5, Warszawa',
          nights: 0,
          capacity: 200,
          status: 'OPEN',
          registrationOpensAt: new Date('2026-06-01T00:00:00Z'),
          registrationClosesAt: new Date('2026-07-18T16:00:00Z'),
          paymentMethods: [],
          pricingConfig: DEFAULT_PRICING,
        },
      },
    },
    include: { instances: true },
  });
  const standaloneInstance = standalone.instances[0];
  await prisma.registrationPage.create({
    data: {
      seriesId: standalone.id,
      slug: 'spotkanie-otwarte',
      isEvergreen: false,
      enabledFields: { phone: false, address: false, dietary: false, children: false },
      locales: ['pl', 'en', 'it'],
      published: true,
    },
  });
  await prisma.eventRsvp.createMany({
    data: [
      { instanceId: standaloneInstance.id, name: 'Jan Kowalski', email: 'jan@example.com', response: 'YES', locale: 'pl' },
      { instanceId: standaloneInstance.id, name: 'Maria Nowak', email: 'maria@example.com', response: 'YES', locale: 'pl' },
      { instanceId: standaloneInstance.id, name: 'Piotr Lis', response: 'NO', locale: 'pl' },
    ],
  });
  console.log('  standalone event: 1 created (slug: spotkanie-otwarte, 3 RSVP)');

  // ── Meeting series (bonus) ────────────────────────────────────────────────
  await prisma.meetingSeries.create({
    data: {
      title: { pl: 'Cotygodniowe spotkanie wspólnoty', en: 'Weekly community meeting' },
      recurrence: 'FREQ=WEEKLY;BYDAY=FR',
    },
  });
  console.log('  meeting series: 1 created');

  console.log('\nSeed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
