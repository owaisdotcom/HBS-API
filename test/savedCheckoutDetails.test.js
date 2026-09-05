import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getSavedCheckoutDetails,
  saveSavedCheckoutDetails,
  deleteSavedCheckoutDetails,
  syncCheckoutDetailsWithUser
} from '../src/controllers/auth.controller.js';
import User from '../src/models/User.js';

describe('Saved Checkout Details - Controller & Logic', function() {
  it('should export getSavedCheckoutDetails, saveSavedCheckoutDetails, and deleteSavedCheckoutDetails', function() {
    assert.strictEqual(typeof getSavedCheckoutDetails, 'function');
    assert.strictEqual(typeof saveSavedCheckoutDetails, 'function');
    assert.strictEqual(typeof deleteSavedCheckoutDetails, 'function');
    assert.strictEqual(typeof syncCheckoutDetailsWithUser, 'function');
  });

  it('should synchronize checkout details onto user and default address correctly', function() {
    const mockUser = {
      fullName: 'Test User',
      email: 'test@example.com',
      phone: '',
      addresses: [],
      savedCheckoutDetails: null
    };

    const details = {
      name: 'Test Customer',
      phone: '3001234567',
      alternatePhone: '3007654321',
      houseNumber: '12-A',
      streetNumber: 'Street 4',
      nearestLandmark: 'Central Park',
      completeAddress: 'House 12-A, Street 4, near Central Park',
      tehsil: 'Model Town',
      district: 'Lahore',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan'
    };

    syncCheckoutDetailsWithUser(mockUser, details);

    // Verify savedCheckoutDetails
    assert.strictEqual(mockUser.savedCheckoutDetails.hasSavedDetails, true);
    assert.strictEqual(mockUser.savedCheckoutDetails.name, 'Test Customer');
    assert.strictEqual(mockUser.savedCheckoutDetails.phone, '3001234567');
    assert.strictEqual(mockUser.savedCheckoutDetails.alternatePhone, '3007654321');
    assert.strictEqual(mockUser.savedCheckoutDetails.houseNumber, '12-A');
    assert.strictEqual(mockUser.savedCheckoutDetails.city, 'Lahore');
    assert.strictEqual(mockUser.savedCheckoutDetails.province, 'Punjab');
    assert.strictEqual(mockUser.savedCheckoutDetails.postalCode, '54000');
    assert.strictEqual(mockUser.savedCheckoutDetails.completeAddress, 'House 12-A, Street 4, near Central Park');

    // Verify phone was assigned to user.phone if previously empty
    assert.strictEqual(mockUser.phone, '3001234567');

    // Verify address was created as default address in addresses array
    assert.strictEqual(mockUser.addresses.length, 1);
    const addr = mockUser.addresses[0];
    assert.strictEqual(addr.isDefault, true);
    assert.strictEqual(addr.city, 'Lahore');
    assert.strictEqual(addr.fullAddress, 'House 12-A, Street 4, near Central Park');
    assert.strictEqual(addr.houseNumber, '12-A');
    assert.strictEqual(addr.province, 'Punjab');
  });

  it('should update existing default address without creating duplicates', function() {
    const mockUser = {
      fullName: 'Test User',
      phone: '3001234567',
      addresses: [{
        label: 'Home',
        fullAddress: 'Old Address',
        city: 'Karachi',
        isDefault: true
      }],
      savedCheckoutDetails: null
    };

    const updatedDetails = {
      name: 'Test User Updated',
      phone: '3009999999',
      completeAddress: 'New Address, Block 5',
      city: 'Islamabad',
      province: 'Islamabad Capital Territory (ICT)',
      postalCode: '44000'
    };

    syncCheckoutDetailsWithUser(mockUser, updatedDetails);

    assert.strictEqual(mockUser.addresses.length, 1, 'Should not add a second address');
    assert.strictEqual(mockUser.addresses[0].city, 'Islamabad');
    assert.strictEqual(mockUser.addresses[0].fullAddress, 'New Address, Block 5');
    assert.strictEqual(mockUser.savedCheckoutDetails.city, 'Islamabad');
  });

  it('should have savedCheckoutDetails path in User mongoose schema', function() {
    const paths = User.schema.paths;
    assert.ok(paths['savedCheckoutDetails.name']);
    assert.ok(paths['savedCheckoutDetails.phone']);
    assert.ok(paths['savedCheckoutDetails.completeAddress']);
    assert.ok(paths['savedCheckoutDetails.city']);
    assert.ok(paths['savedCheckoutDetails.province']);
    assert.ok(paths['savedCheckoutDetails.hasSavedDetails']);
  });
});
