#!/usr/bin/env bash
# Project FT flow (2026-09-28). WRITES an order + vendor row: run on the LOCAL DB only.
#   PORT=3002 backend running, then: bash scripts/verify_project_techs.sh
M=http://localhost:3002/api/v1/mobile; A=http://localhost:3002/api/v1/admin
j(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(eval(process.argv[1]))}catch(e){console.log("RAW",s.slice(0,300))}})' "$1"; }
AT=$(curl -s -X POST $A/auth -H 'Content-Type: application/json' -d '{"userName":"amit.joshi","password":"123456"}' | j 'j.data.token')
TT=$(curl -s -X POST $M/tech/auth/login -H 'Content-Type: application/json' -d '{"userName":"rahul.jadhav","password":"123456"}' | j 'j.data.token')
echo "set techs:"; curl -s -X PUT $A/project/PRJ-2026-0024/technicians -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"userIds":[54]}' | j 'j.message+" "+JSON.stringify(j.data)'
echo "panel detail techs:"; curl -s $A/project/PRJ-2026-0024 -H "Authorization: Bearer $AT" | j 'JSON.stringify(j.data?.technicians)'
P=$(curl -s $M/tech/projects -H "Authorization: Bearer $TT"); echo "$P" | j 'JSON.stringify(j.data.map(p=>[p.projectId,p.client.companyName,p.products.length]))'
PR=$(echo "$P" | j 'JSON.stringify(j.data.find(p=>p.projectId=="PRJ-2026-0024").products[0])')
echo "create:"; O=$(curl -s -X POST $M/tech/orders -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"projectId\":\"PRJ-2026-0024\",\"productName\":$(echo $PR|j 'JSON.stringify(j.productName)'),\"productGrade\":$(echo $PR|j 'JSON.stringify(j.productGrade)'),\"quantity\":\"6\",\"date\":\"2026-09-30\",\"time\":\"10:00\"}" | tee /dev/stderr | j 'j.data?.orderId'); echo; echo order $O
echo "in tech list:"; curl -s "$M/tech/orders?type=active&limit=100" -H "Authorization: Bearer $TT" | j '(j.data.orders||j.data).some(o=>o.orderId=="'$O'")'
V=$(curl -s $M/tech/vendors -H "Authorization: Bearer $TT" | j 'JSON.stringify(j.data.find(v=>v.locations.length))'); echo vendor $(echo $V | cut -c1-120)
VID=$(echo $V|j 'j.id'); LID=$(echo $V|j 'j.locations[0].id')
echo "add vendor:"; curl -s -X POST $M/tech/orders/$O/vendor -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"vendorId\":$VID,\"vendorLocationId\":$LID}" | j 'j.message'
echo "detail vendors:"; curl -s $M/tech/orders/$O -H "Authorization: Bearer $TT" | j 'JSON.stringify(j.data.vendors.map(v=>v.vendor.companyName))+" band "+j.data.creditBand'
echo "other project order hidden:"; curl -s -o /dev/null -w "%{http_code}\n" -X POST $M/tech/orders/ORD-2026-0001/vendor -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d "{\"vendorId\":$VID}"
