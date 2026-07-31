import db from "../src/config/database.js";
import { encrypt } from "../src/helper/security.js";

function daysAgo(n, hour = 9, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, min, 0, 0);
  return d;
}
function dateStr(d) {
  return d.toISOString().slice(0, 10);
}
function timeStr(hour, min) {
  const h = ((hour + 11) % 12) + 1;
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`;
}
async function nextSeq(model, field, prefix) {
  const last = await db[model].findFirst({
    where: { [field]: { startsWith: prefix } },
    orderBy: { [field]: "desc" },
  });
  if (!last) return 1;
  return parseInt(last[field].split("-").pop()) + 1;
}

const YEAR = new Date().getFullYear();

async function main() {
  console.log("Seeding realtime-looking data...");

  // ── Users (field technicians + one accountant) ─────────────────────────
  const techNames = [
    ["Ramesh Yadav", "EMP2001", "ramesh.yadav"],
    ["Suresh Pawar", "EMP2002", "suresh.pawar"],
    ["Vikas Chauhan", "EMP2003", "vikas.chauhan"],
    ["Ganesh Koli", "EMP2004", "ganesh.koli"],
  ];
  const password = encrypt("Shivesh@123");
  const technicians = [];
  for (const [name, employeeId, userName] of techNames) {
    let u = await db.user.findFirst({ where: { userName } });
    if (!u) {
      u = await db.user.create({
        data: {
          name,
          employeeId,
          userName,
          password,
          role: "FIELD_TECHNICIAN",
          status: true,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          menuAccess: {},
        },
      });
    }
    technicians.push(u);
  }
  console.log(`Users ready: ${technicians.length} field technicians`);

  // ── Vendors ──────────────────────────────────────────────────────────────
  const vendorSeed = [
    {
      companyName: "Shree Balaji RMC Suppliers",
      ownerName: "Prakash Deshmukh",
      phone: "9812345670",
      email: "prakash@shreebalajirmc.in",
      address: "Plot 14, MIDC Industrial Estate, Bhiwandi, Thane, Maharashtra",
      gstNumber: `27AAACS${Math.floor(1000 + Math.random() * 8999)}F1Z${Math.floor(Math.random() * 9)}`,
      panNumber: `AAACS${Math.floor(1000 + Math.random() * 8999)}F`,
      location: {
        plantName: "Bhiwandi Batching Plant",
        address: "Plot 14, MIDC Industrial Estate, Bhiwandi, Thane, Maharashtra 421302",
        latitude: "19.2967",
        longitude: "73.0631",
      },
      handler: { name: "Ravi Salunkhe", phone: "9822233445", email: "ravi.salunkhe@shreebalajirmc.in" },
    },
    {
      companyName: "Konkan Concrete Works",
      ownerName: "Sanjay Naik",
      phone: "9823456781",
      email: "sanjay@konkanconcrete.com",
      address: "Survey No. 45, Panvel-Uran Road, Raigad, Maharashtra",
      gstNumber: `27AAACK${Math.floor(1000 + Math.random() * 8999)}F1Z${Math.floor(Math.random() * 9)}`,
      panNumber: `AAACK${Math.floor(1000 + Math.random() * 8999)}F`,
      location: {
        plantName: "Panvel Plant",
        address: "Survey No. 45, Panvel-Uran Road, Raigad, Maharashtra 410206",
        latitude: "18.9894",
        longitude: "73.1175",
      },
      handler: { name: "Dattu More", phone: "9833344556", email: "dattu.more@konkanconcrete.com" },
    },
    {
      companyName: "Silverline Building Materials",
      ownerName: "Rakesh Iyer",
      phone: "9834567892",
      email: "rakesh@silverlinebm.co.in",
      address: "Gala No. 7, Kalyan-Shil Road, Dombivli, Thane, Maharashtra",
      gstNumber: `27AAACL${Math.floor(1000 + Math.random() * 8999)}F1Z${Math.floor(Math.random() * 9)}`,
      panNumber: `AAACL${Math.floor(1000 + Math.random() * 8999)}F`,
      location: {
        plantName: "Dombivli Plant",
        address: "Gala No. 7, Kalyan-Shil Road, Dombivli East, Thane, Maharashtra 421204",
        latitude: "19.2183",
        longitude: "73.0864",
      },
      handler: { name: "Manoj Gharat", phone: "9844455667", email: "manoj.gharat@silverlinebm.co.in" },
    },
  ];

  const vendors = [];
  for (const v of vendorSeed) {
    let vendor = await db.vendor.findFirst({ where: { companyName: v.companyName } });
    if (!vendor) {
      vendor = await db.vendor.create({
        data: {
          companyName: v.companyName,
          ownerName: v.ownerName,
          phone: v.phone,
          email: v.email,
          address: v.address,
          gstNumber: v.gstNumber,
          panNumber: v.panNumber,
          isActive: true,
        },
      });
      const location = await db.vendorLocation.create({
        data: {
          vendorId: vendor.id,
          plantName: v.location.plantName,
          address: v.location.address,
          latitude: v.location.latitude,
          longitude: v.location.longitude,
        },
      });
      const handler = await db.vendorHandler.create({
        data: {
          vendorLocationId: location.id,
          name: v.handler.name,
          phone: v.handler.phone,
          email: v.handler.email,
        },
      });
      vendors.push({ vendor, location, handler });
    } else {
      const location = await db.vendorLocation.findFirst({ where: { vendorId: vendor.id, isDeleted: false } });
      const handler = location ? await db.vendorHandler.findFirst({ where: { vendorLocationId: location.id, isDeleted: false } }) : null;
      vendors.push({ vendor, location, handler });
    }
  }
  console.log(`Vendors ready: ${vendors.length}`);

  // ── Clients ──────────────────────────────────────────────────────────────
  const clientSeed = [
    {
      companyName: "Marathon NextGen Realty",
      ownerName: "Vinay Shah",
      contactNumber: "9900112233",
      email: "vinay.shah@marathonnextgen.example",
      address: "Marathon Futurex, Lower Parel, Mumbai, Maharashtra 400013",
    },
    {
      companyName: "Godrej Properties Ltd",
      ownerName: "Kavita Menon",
      contactNumber: "9900223344",
      email: "kavita.menon@godrejproperties.example",
      address: "Godrej One, Pirojshanagar, Vikhroli, Mumbai, Maharashtra 400079",
    },
    {
      companyName: "Runwal Group",
      ownerName: "Anil Bhandari",
      contactNumber: "9900334455",
      email: "anil.bhandari@runwalgroup.example",
      address: "Runwal Forests, LBS Marg, Mulund West, Mumbai, Maharashtra 400080",
    },
  ];

  let clientSeq = await nextSeq("client", "clientId", `CL-${YEAR}-`);
  const clients = [];
  for (const c of clientSeed) {
    let client = await db.client.findFirst({ where: { email: c.email } });
    if (!client) {
      client = await db.client.create({
        data: {
          clientId: `CL-${YEAR}-${String(clientSeq++).padStart(4, "0")}`,
          companyName: c.companyName,
          ownerName: c.ownerName,
          contactNumber: c.contactNumber,
          email: c.email,
          hasGST: false,
          address: c.address,
          status: "ACTIVE",
          kycStatus: "VERIFIED",
        },
      });
    }
    clients.push(client);
  }
  // Reuse a couple of existing active clients too, for variety
  const existingActiveClients = await db.client.findMany({
    where: { isDeleted: false, companyName: { in: ["Neelam Enterprises", "Nova Infra Services Pvt Ltd", "Curl Test Company"] } },
  });
  const allClients = [...clients, ...existingActiveClients];
  console.log(`Clients ready: ${clients.length} new, ${existingActiveClients.length} reused`);

  // ── Projects ─────────────────────────────────────────────────────────────
  let projectSeq = await nextSeq("project", "projectId", `PRJ-${YEAR}-`);
  const projectSeed = [
    {
      client: clients[0],
      projectName: "Marathon Futurex Tower C",
      siteName: "Tower C - Lower Parel",
      projectLocation: "Lower Parel, Mumbai, Maharashtra 400013",
      lat: 18.9967, lng: 72.8258,
      products: [
        { productName: "RMC", productGrade: "M30", costPrice: 5200 },
        { productName: "RMC", productGrade: "M25", costPrice: 4800 },
      ],
    },
    {
      client: clients[1],
      projectName: "Godrej Emerald Phase 2",
      siteName: "Phase 2 - Vikhroli",
      projectLocation: "Vikhroli, Mumbai, Maharashtra 400079",
      lat: 19.1076, lng: 72.9298,
      products: [{ productName: "RMC", productGrade: "M40", costPrice: 5600 }],
    },
    {
      client: clients[2],
      projectName: "Runwal Forests Wing D",
      siteName: "Wing D - Mulund",
      projectLocation: "Mulund West, Mumbai, Maharashtra 400080",
      lat: 19.1726, lng: 72.9425,
      products: [{ productName: "RMC", productGrade: "M20", costPrice: 4300 }],
    },
    {
      client: existingActiveClients[0] ?? clients[0],
      projectName: "Neelam Heights Extension",
      siteName: "Extension Block",
      projectLocation: "Ring Road, Surat, Gujarat",
      lat: 21.1858, lng: 72.8065,
      products: [{ productName: "RMC-NEW", productGrade: "M10", costPrice: 800 }],
    },
  ];

  const projects = [];
  for (const p of projectSeed) {
    if (!p.client) continue;
    let project = await db.project.findFirst({ where: { projectName: p.projectName, clientId: p.client.id } });
    if (!project) {
      project = await db.project.create({
        data: {
          projectId: `PRJ-${YEAR}-${String(projectSeq++).padStart(4, "0")}`,
          projectName: p.projectName,
          clientId: p.client.id,
          siteName: p.siteName,
          projectLocation: p.projectLocation,
          status: "ACTIVE",
          commissionPersonName: "Site Agent",
          commissionAmountPerM3: 60,
          creditAmount: 500000,
          creditResetPeriodDays: 30,
          latitude: p.lat,
          longitude: p.lng,
        },
      });
      for (const prod of p.products) {
        const projectProduct = await db.projectProduct.create({
          data: { projectId: project.id, productName: prod.productName, productGrade: prod.productGrade, costPrice: prod.costPrice },
        });
        const vendorPick = vendors[Math.floor(Math.random() * vendors.length)];
        await db.projectProductVendor.create({
          data: {
            projectProductId: projectProduct.id,
            vendorId: vendorPick.vendor.id,
            customPrice: prod.costPrice - Math.floor(Math.random() * 500 + 200),
            priority: "HIGH",
          },
        });
      }
    }
    project = await db.project.findFirst({ where: { id: project.id }, include: { projectProducts: true } });
    projects.push(project);
  }
  console.log(`Projects ready: ${projects.length}`);

  // ── Orders + vendors + technicians + TMs + comments + bills + activity ──
  let orderSeq = await nextSeq("order", "orderId", `ORD-${YEAR}-`);
  let billSeq = await nextSeq("bill", "billNo", `BILL-${YEAR}-`);

  const statusPlan = [
    ...Array(3).fill("NEW"),
    ...Array(3).fill("CONFIRMED"),
    ...Array(3).fill("IN_PROGRESS"),
    ...Array(3).fill("DELIVERED"),
    ...Array(5).fill("COMPLETED"),
    ...Array(1).fill("CANCELLED"),
  ];

  const adminUser = await db.user.findFirst({ where: { role: "ADMIN", isDeleted: false, status: true } });

  let dayOffset = statusPlan.length + 5;
  for (const status of statusPlan) {
    const project = projects[Math.floor(Math.random() * projects.length)];
    if (!project || !project.projectProducts.length) continue;
    const pp = project.projectProducts[Math.floor(Math.random() * project.projectProducts.length)];
    const vendorPick = vendors[Math.floor(Math.random() * vendors.length)];
    const qty = String(Math.floor(Math.random() * 8 + 4) * 3);
    const createdAt = daysAgo(dayOffset, 8 + Math.floor(Math.random() * 3), 0);
    dayOffset -= Math.floor(Math.random() * 2 + 1);

    const deliveryStatus =
      status === "COMPLETED" ? "COMPLETED" :
      status === "DELIVERED" ? "DELIVERED" :
      status === "IN_PROGRESS" ? "IN_TRANSIT" :
      status === "CANCELLED" ? "ASSIGNED" : "ASSIGNED";

    const orderId = `ORD-${YEAR}-${String(orderSeq++).padStart(4, "0")}`;
    const chosenTechs = [...technicians].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));

    const order = await db.order.create({
      data: {
        orderId,
        projectId: project.id,
        clientId: project.clientId,
        productName: pp.productName,
        productGrade: pp.productGrade,
        quantity: qty,
        deliveryAddress: project.projectLocation,
        date: dateStr(createdAt),
        time: timeStr(8 + Math.floor(Math.random() * 4), 30),
        status,
        deliveryStatus,
        createdAt,
        updatedAt: createdAt,
        vendors: {
          create: {
            vendorId: vendorPick.vendor.id,
            vendorLocationId: vendorPick.location?.id ?? null,
            vendorHandlerId: vendorPick.handler?.id ?? null,
          },
        },
        technicians: { create: chosenTechs.map((t) => ({ userId: t.id })) },
      },
    });

    // TMs — number of trucks scales with quantity
    const truckCount = Math.max(1, Math.min(3, Math.round(Number(qty) / 15)));
    const tmStatus =
      status === "COMPLETED" ? "COMPLETED" :
      status === "DELIVERED" ? "DELIVERED" :
      status === "IN_PROGRESS" ? "IN_TRANSIT" : "ASSIGNED";

    for (let i = 0; i < truckCount; i++) {
      const truckNo = `MH${4 + Math.floor(Math.random() * 40)}${["AB","BC","CD","DE"][Math.floor(Math.random()*4)]}${1000 + Math.floor(Math.random()*8999)}`;
      const isDone = tmStatus === "COMPLETED" || tmStatus === "DELIVERED";
      await db.tmDetail.create({
        data: {
          orderId: order.id,
          tmNumber: `TM ${String(i + 1).padStart(2, "0")}`,
          truckNo,
          qty: String(Math.round(Number(qty) / truckCount)),
          status: tmStatus,
          approvalStatus: isDone ? "ACCEPTED" : "PENDING",
          dispatchTime: isDone || tmStatus === "IN_TRANSIT" ? timeStr(9, i * 10) : null,
          arrivalTime: isDone ? timeStr(10, i * 10) : null,
          batchStartTime: isDone ? timeStr(9, 45) : null,
          batchEndTime: isDone ? timeStr(10, 15) : null,
          challanNo: isDone ? `CH-${orderId.split("-").pop()}-${i + 1}` : null,
          approvedAt: isDone ? createdAt : null,
        },
      });
    }

    // Comments
    await db.orderComment.create({
      data: {
        orderId: order.id,
        message: `Order ${orderId} created for ${pp.productName} ${pp.productGrade}, ${qty} m3.`,
        authorType: "ADMIN",
        authorId: String(adminUser?.id ?? 3),
        authorName: adminUser?.name ?? "Admin",
        createdAt,
      },
    });
    if (status === "CANCELLED") {
      await db.orderComment.create({
        data: {
          orderId: order.id,
          message: `Order cancelled by client request.`,
          authorType: "ADMIN",
          authorId: String(adminUser?.id ?? 3),
          authorName: adminUser?.name ?? "Admin",
          createdAt: new Date(createdAt.getTime() + 3600 * 1000),
        },
      });
    }

    // Activity log
    await db.activity.create({
      data: {
        title: "Order created",
        description: `Order ${orderId} created for ${pp.productName} ${pp.productGrade}`,
        entityType: "ORDER",
        entityId: order.id,
        action: "CREATED",
        createdById: adminUser?.id ?? 3,
        createdAt,
      },
    });
    if (status !== "NEW") {
      await db.activity.create({
        data: {
          title: "Order status changed",
          description: `Order ${orderId} moved to ${status}`,
          entityType: "ORDER",
          entityId: order.id,
          action: "STATUS_CHANGED",
          createdById: adminUser?.id ?? 3,
          createdAt: new Date(createdAt.getTime() + 2 * 3600 * 1000),
        },
      });
    }

    // Bill for COMPLETED orders
    if (status === "COMPLETED") {
      const rate = pp.costPrice - Math.floor(Math.random() * 300 + 100);
      const amount = Number(qty) * rate;
      const billStatusPool = ["PAID", "PENDING", "OVERDUE", "SENT"];
      const billStatus = billStatusPool[Math.floor(Math.random() * billStatusPool.length)];
      const issueDate = new Date(createdAt.getTime() + 24 * 3600 * 1000);
      const dueDate = new Date(issueDate.getTime() + 15 * 24 * 3600 * 1000);
      const billNo = `BILL-${YEAR}-${String(billSeq++).padStart(4, "0")}`;

      await db.bill.create({
        data: {
          billNo,
          orderId: order.id,
          quantity: Number(qty),
          rate,
          amount,
          status: billStatus,
          issueDate,
          dueDate,
          paidAt: billStatus === "PAID" ? new Date(issueDate.getTime() + 5 * 24 * 3600 * 1000) : null,
        },
      });

      await db.activity.create({
        data: {
          title: "Bill generated",
          description: `Bill ${billNo} generated for order ${orderId} — ${qty} × ${rate} = ${amount}`,
          entityType: "ORDER",
          entityId: order.id,
          action: "CREATED",
          createdById: adminUser?.id ?? 3,
          createdAt: issueDate,
        },
      });
    }

    console.log(`Created order ${orderId} [${status}] with ${truckCount} TM(s)`);
  }

  // ── Leads ────────────────────────────────────────────────────────────────
  const pmUser = await db.user.findFirst({ where: { role: "PROJECT_MANAGER", isDeleted: false, status: true } });
  const leadSeed = [
    {
      companyName: "Kalpataru Sunrise",
      contactPerson: "Ajay Rathi",
      email: "ajay.rathi@kalpatarusunrise.example",
      phone: "9911223344",
      address: "Kolshet Road, Thane West, Maharashtra",
      source: "REFERRAL",
      status: "NEW",
      requirement: "RMC M25 grade, approx 200 m3 over next quarter",
      title: "Kalpataru Sunrise — new tower RMC requirement",
    },
    {
      companyName: "Oberoi Realty Sky City",
      contactPerson: "Meera Kulkarni",
      email: "meera.kulkarni@oberoirealty.example",
      phone: "9911334455",
      address: "Borivali East, Mumbai, Maharashtra",
      source: "WEBSITE",
      status: "IN_PROGRESS",
      requirement: "RMC M30/M40 for podium slab, urgent",
      title: "Oberoi Sky City podium slab RMC",
    },
    {
      companyName: "Piramal Vaikunth",
      contactPerson: "Deepak Solanki",
      email: "deepak.solanki@piramalvaikunth.example",
      phone: "9911445566",
      address: "Balkum, Thane West, Maharashtra",
      source: "COLD_CALL",
      status: "CONVERTED",
      requirement: "RMC ongoing supply, monthly PO",
      title: "Piramal Vaikunth monthly RMC supply",
    },
  ];
  for (const l of leadSeed) {
    const exists = await db.lead.findFirst({ where: { email: l.email } });
    if (!exists) {
      await db.lead.create({
        data: {
          companyName: l.companyName,
          contactPerson: l.contactPerson,
          email: l.email,
          phone: l.phone,
          address: l.address,
          source: l.source,
          status: l.status,
          requirement: l.requirement,
          title: l.title,
          assignedToId: pmUser?.id ?? null,
          date: new Date(),
        },
      });
    }
  }
  console.log(`Leads ready`);

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
