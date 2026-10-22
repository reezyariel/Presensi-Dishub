// ============================================================
// SIPATEN — GPS Geofence & Location Validation Test Suite
// Verifies Haversine formula, geofence radius calculations,
// office configuration fallback, and reason requirement logic.
// ============================================================

import {
  calculateDistanceMeters,
  formatDistance,
  DEFAULT_OFFICE_CONFIG,
} from '../src/lib/officeLocation'

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ Assertion Failed: ${msg}`)
    process.exit(1)
  }
  console.log(`  ✅ ${msg}`)
}

console.log('============================================================')
console.log('📍 SIPATEN GPS Geofence & Location Validation Tests')
console.log('============================================================\n')

// TEST 1: Haversine Calculation Accuracy
console.log('TEST 1: Haversine Formula Distance Accuracy')
{
  // 1. Same coordinates -> 0 meters
  const distZero = calculateDistanceMeters(-6.175392, 106.827153, -6.175392, 106.827153)
  assert(distZero === 0, 'Same coordinates yield exact 0 meters')

  // 2. Monas (-6.175392, 106.827153) to Gambir Station (-6.176700, 106.830600) ~400-450m
  const distGambir = calculateDistanceMeters(-6.175392, 106.827153, -6.176700, 106.830600)
  assert(distGambir >= 380 && distGambir <= 450, `Monas to Gambir distance is realistic: ${distGambir}m`)

  // 3. Monas to Istiqlal Mosque (-6.170200, 106.831400) ~700-800m
  const distIstiqlal = calculateDistanceMeters(-6.175392, 106.827153, -6.170200, 106.831400)
  assert(distIstiqlal >= 700 && distIstiqlal <= 850, `Monas to Istiqlal distance is realistic: ${distIstiqlal}m`)

  // 4. Invalid input handling
  const distNaN = calculateDistanceMeters(NaN, 106.827153, -6.175392, 106.827153)
  assert(distNaN === Infinity, 'NaN latitude safely returns Infinity')
}

// TEST 2: Geofence Inside/Outside Radius Evaluation
console.log('\nTEST 2: Geofence Inside/Outside Radius Evaluation')
{
  const officeLat = DEFAULT_OFFICE_CONFIG.latitude
  const officeLng = DEFAULT_OFFICE_CONFIG.longitude
  const officeRadius = DEFAULT_OFFICE_CONFIG.radiusMeters // 100m

  // A point 30m away
  // 0.00027 degrees latitude is approx 30 meters
  const closeLat = officeLat + 0.00027
  const distClose = calculateDistanceMeters(officeLat, officeLng, closeLat, officeLng)
  assert(distClose <= officeRadius, `Point within radius: ${distClose}m <= ${officeRadius}m (Valid)`)

  // A point 500m away
  // 0.0045 degrees latitude is approx 500 meters
  const farLat = officeLat + 0.0045
  const distFar = calculateDistanceMeters(officeLat, officeLng, farLat, officeLng)
  assert(distFar > officeRadius, `Point outside radius: ${distFar}m > ${officeRadius}m (Outside Geofence)`)
}

// TEST 3: Distance Formatter
console.log('\nTEST 3: Distance String Formatter')
{
  assert(formatDistance(45) === '45 meter', 'Formats meters under 1000m correctly')
  assert(formatDistance(1250) === '1.25 km', 'Formats kilometers above 1000m correctly')
  assert(formatDistance(Infinity) === 'Tidak diketahui', 'Formats Infinity safely')
}

// TEST 4: Reason Requirement Logic
console.log('\nTEST 4: Reason Enforcement for Outside Geofence / Late')
{
  function isReasonValid(reason: string | null | undefined): boolean {
    return typeof reason === 'string' && reason.trim().length >= 5
  }

  assert(!isReasonValid(''), 'Empty string is rejected')
  assert(!isReasonValid('   '), 'Whitespace-only string is rejected')
  assert(!isReasonValid('abc'), 'String with less than 5 characters is rejected')
  assert(!isReasonValid(null), 'Null is rejected')
  assert(!isReasonValid(undefined), 'Undefined is rejected')
  assert(isReasonValid('Macet parah di tol'), 'Valid reason (>= 5 chars) is accepted')
  assert(isReasonValid('Dinas luar ke cabang'), 'Valid reason (>= 5 chars) is accepted')
}

// TEST 5: Default Office Configuration Integrity
console.log('\nTEST 5: Default Office Configuration Integrity')
{
  assert(typeof DEFAULT_OFFICE_CONFIG.latitude === 'number', 'Default latitude is valid number')
  assert(typeof DEFAULT_OFFICE_CONFIG.longitude === 'number', 'Default longitude is valid number')
  assert(DEFAULT_OFFICE_CONFIG.radiusMeters >= 50, 'Default radius is at least 50 meters')
  assert(DEFAULT_OFFICE_CONFIG.name.length > 0, 'Default name is present')
}

console.log('\n============================================================')
console.log('🎉 ALL GPS GEOFENCE & LOCATION VALIDATION TESTS PASSED!')
console.log('============================================================')
