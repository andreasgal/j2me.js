// Copyright 2009 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
* @fileoverview Defines a Long class for representing a 64-bit two's-complement
* integer value, which faithfully simulates the behavior of a Java "long". This
* implementation is derived from LongLib in GWT.
*
*/

(function (exports) {
    /**
    * Constructs a 64-bit two's-complement integer, given its low and high 32-bit
    * values as *signed* integers.  See the from* functions below for more
    * convenient ways of constructing Longs.
    *
    * The internal representation of a long is the two given signed, 32-bit values.
    * We use 32-bit pieces because these are the size of integers on which
    * Javascript performs bit-operations.  For operations like addition and
    * multiplication, we split each number into 16-bit pieces, which can easily be
    * multiplied within Javascript's floating-point representation without overflow
    * or change in sign.
    *
    * In the algorithms below, we frequently reduce the negative case to the
    * positive case by negating the input(s) and then post-processing the result.
    * Note that we must ALWAYS check specially whether those values are MIN_VALUE
    * (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
    * a positive number, it overflows back into a negative).  Not handling this
    * case would often result in infinite recursion.
    *
    * @param {number} low  The low (signed) 32 bits of the long.
    * @param {number} high  The high (signed) 32 bits of the long.
    * @constructor
    */
    function Long(low, high) {
        this.low_ = low | 0; // force into 32 signed bits.
        this.high_ = high | 0; // force into 32 signed bits.
        this.string_ = null;
    }

    var IntCache = {};

    /**
    * Returns a Long representing the given (32-bit) integer value.
    * @param {number} value The 32-bit integer in question.
    * @return {!Long} The corresponding Long value.
    */
    function fromInt(value) {
        if (-128 <= value && value < 128) {
            var cachedObj = IntCache[value];
            if (cachedObj) {
                return cachedObj;
            }
        }

        var obj = new Long(value, value < 0 ? -1 : 0);
        if (-128 <= value && value < 128) {
            IntCache[value] = obj;
        }
        return obj;
    };

    /**
    * Returns a Long representing the given value, provided that it is a finite
    * number.  Otherwise, zero is returned.
    * @param {number} value The number in question.
    * @return {!Long} The corresponding Long value.
    */
    function fromNumber(value) {
        if (isNaN(value) || !isFinite(value)) {
            return ZERO;
        } else if (value <= -TWO_PWR_63_DBL_) {
            return MIN_VALUE;
        } else if (value + 1 >= TWO_PWR_63_DBL_) {
            return MAX_VALUE;
        } else if (value < 0) {
            return fromNumber(-value).negate();
        } else {
            return new Long((value % TWO_PWR_32_DBL_) | 0, (value / TWO_PWR_32_DBL_) | 0);
        }
    };

    var LongCache = new Array(4093);
    for (var i = 0; i < LongCache.length; i++) {
      LongCache[i] = null;
    }

    /**
    * Returns a Long representing the 64-bit integer that comes by concatenating
    * the given high and low bits.  Each is assumed to use 32 bits.
    * @param {number} lowBits The low 32-bits.
    * @param {number} highBits The high 32-bits.
    * @return {!Long} The corresponding Long value.
    */
    function fromBits(lowBits, highBits) {
        // Don't allocate Long objects for -1, 0, 1, 2, 3, 4. These low/high bit patterns occur
        // frequently in computations.
        if (highBits === 0) {
            switch (lowBits) {
                case 0: return ZERO;
                case 1: return ONE;
                case 2: return TWO;
                case 3: return THREE;
                case 4: return FOUR;
            }
        } else if (highBits === -1 && lowBits === -1) {
            return NEG_ONE;
        }
        // Cache recently used Longs by hashing low/high bits to the range 0 -> 4092.  Most
        // Long objects are redundant temporarily computed values so they benefit from this
        // caching scheme.
        var index = (((((lowBits * 32) | 0) + highBits) | 0) & 0x7fffffff) % 4093;
        var entry = LongCache[index];
        if (entry && entry.high_ === highBits && entry.low_ === lowBits) {
            return entry;
        } else {
            // Update the cache entry on a miss, thus adapting to new computation phases.
            return (LongCache[index] = new Long(lowBits, highBits));
        }
    };

    /**
    * Returns a Long representation of the given string, written using the given
    * radix.
    * @param {string} str The textual representation of the Long.
    * @param {number=} opt_radix The radix in which the text is written.
    * @return {!Long} The corresponding Long value.
    */
    function fromString(str, opt_radix) {
        if (str.length == 0) {
            throw Error('number format error: empty string');
        }

        var radix = opt_radix || 10;
        if (radix < 2 || 36 < radix) {
            throw Error('radix out of range: ' + radix);
        }

        if (str.charAt(0) == '-') {
            return fromString(str.substring(1), radix).negate();
        } else if (str.indexOf('-') >= 0) {
            throw Error('number format error: interior "-" character: ' + str);
        }

        // Do several (8) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = fromNumber(Math.pow(radix, 8));

        var result = ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(fromNumber(value));
            }
        }
        return result;
    };

    /** @return {number} The value, assuming it is a 32-bit integer. */
    Long.prototype.toInt = function () {
        return this.low_;
    };

    /** @return {number} The closest floating-point representation to this value. */
    Long.prototype.toNumber = function () {
        return this.high_ * TWO_PWR_32_DBL_ + this.getLowBitsUnsigned();
    };

    /**
    * @param {number=} opt_radix The radix in which the text should be written.
    * @return {string} The textual representation of this value.
    */
    Long.prototype.toString = function (opt_radix) {
        var radix = opt_radix || 10;
        if (radix < 2 || 36 < radix) {
            throw Error('radix out of range: ' + radix);
        }
        if (radix === 10 && this.string_) {
            return this.string_;
        }
        if (this.isZero()) {
            return '0';
        }

        if (this.isNegative()) {
            if (this.equals(MIN_VALUE)) {
                // We need to change the Long value before it can be negated, so we remove
                // the bottom-most digit in this base and then recurse to do the rest.
                var radixLong = fromNumber(radix);
                var div = this.div(radixLong);
                var rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else {
                var result = '-' + this.negate().toString(radix);
                if (radix === 10) {
                    this.string_ = result;
                }
                return result;
            }
        }

        // Do several (6) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = fromNumber(Math.pow(radix, 6));

        var rem = this;
        var result = '';
        while (true) {
            var remDiv = rem.div(radixToPower);
            var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
            var digits = intval.toString(radix);

            rem = remDiv;
            if (rem.isZero()) {
                result = digits + result;
                if (radix === 10) {
                    this.string_ = result;
                }
                return result;
            } else {
                while (digits.length < 6) {
                    digits = '0' + digits;
                }
                result = '' + digits + result;
            }
        }
    };

    /** @return {number} The high 32-bits as a signed value. */
    Long.prototype.getHighBits = function () {
        return this.high_;
    };

    /** @return {number} The low 32-bits as a signed value. */
    Long.prototype.getLowBits = function () {
        return this.low_;
    };

    /** @return {number} The low 32-bits as an unsigned value. */
    Long.prototype.getLowBitsUnsigned = function () {
        return (this.low_ >= 0) ? this.low_ : TWO_PWR_32_DBL_ + this.low_;
    };

    /**
    * @return {number} Returns the number of bits needed to represent the absolute
    *     value of this Long.
    */
    Long.prototype.getNumBitsAbs = function () {
        if (this.isNegative()) {
            if (this.equals(MIN_VALUE)) {
                return 64;
            } else {
                return this.negate().getNumBitsAbs();
            }
        } else {
            var val = this.high_ != 0 ? this.high_ : this.low_;
            for (var bit = 31; bit > 0; bit--) {
                if ((val & (1 << bit)) != 0) {
                    break;
                }
            }
            return this.high_ != 0 ? bit + 33 : bit + 1;
        }
    };

    /** @return {boolean} Whether this value is zero. */
    Long.prototype.isZero = function () {
        return this.high_ == 0 && this.low_ == 0;
    };

    /** @return {boolean} Whether this value is negative. */
    Long.prototype.isNegative = function () {
        return this.high_ < 0;
    };

    /** @return {boolean} Whether this value is odd. */
    Long.prototype.isOdd = function () {
        return (this.low_ & 1) == 1;
    };

    /**
    * @param {Long} other Long to compare against.
    * @return {boolean} Whether this Long equals the other.
    */
    Long.prototype.equals = function (other) {
        return (this.high_ == other.high_) && (this.low_ == other.low_);
    };

    /**
    * @param {Long} other Long to compare against.
    * @return {boolean} Whether this Long does not equal the other.
    */
    Long.prototype.notEquals = function (other) {
        return (this.high_ != other.high_) || (this.low_ != other.low_);
    };

    /**
    * @param {Long} other Long to compare against.
    * @return {boolean} Whether this Long is less than the other.
    */
    Long.prototype.lessThan = function (other) {
        return this.compare(other) < 0;
    };

    /**
    * @param {Long} other Long to compare against.
    * @return {boolean} Whether this Long is less than or equal to the other.
    */
    Long.prototype.lessThanOrEqual = function (other) {
        return this.compare(other) <= 0;
    };

    /**
    * @param {Long} other Long to compare against.
    * @return {boolean} Whether this Long is greater than the other.
    */
    Long.prototype.greaterThan = function (other) {
        return this.compare(other) > 0;
    };

    /**
    * @param {Long} other Long to compare against.
    * @return {boolean} Whether this Long is greater than or equal to the other.
    */
    Long.prototype.greaterThanOrEqual = function (other) {
        return this.compare(other) >= 0;
    };

    /**
    * Compares this Long with the given one.
    * @param {Long} other Long to compare against.
    * @return {number} 0 if they are the same, 1 if the this is greater, and -1
    *     if the given one is greater.
    */
    Long.prototype.compare = function (other) {
        if (other.isZero()) {
            if (this.isZero()) {
                return 0;
            } else if (this.high_ < 0) {
                return -1;
            } else {
                return 1;
            }
        }
        if (this.equals(other)) {
            return 0;
        }

        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) {
            return -1;
        }
        if (!thisNeg && otherNeg) {
            return 1;
        }

        // at this point, the signs are the same, so subtraction will not overflow
        if (this.subtract(other).isNegative()) {
            return -1;
        } else {
            return 1;
        }
    };

    /** @return {!Long} The negation of this value. */
    Long.prototype.negate = function () {
        if (this.equals(MIN_VALUE)) {
            return MIN_VALUE;
        } else {
            return this.not().add(ONE);
        }
    };

    /**
    * Returns the sum of this and the given Long.
    * @param {Long} other Long to add to this one.
    * @return {!Long} The sum of this and the given Long.
    */
    Long.prototype.add = function (other) {
        // 1 + 0, 1 + 1, 1 + 2, 1 + 3 are frequently occuring operations, special
        // case them to avoid extra computations.
        if (other === ONE && this.high_ === 0) {
            switch (this.low_) {
                case 0: return ONE;
                case 1: return TWO;
                case 2: return THREE;
                case 3: return FOUR;
            }
        }
        // Divide each number into 4 chunks of 16 bits, and then sum the chunks.
        var a48 = this.high_ >>> 16;
        var a32 = this.high_ & 0xFFFF;
        var a16 = this.low_ >>> 16;
        var a00 = this.low_ & 0xFFFF;

        var b48 = other.high_ >>> 16;
        var b32 = other.high_ & 0xFFFF;
        var b16 = other.low_ >>> 16;
        var b00 = other.low_ & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 + b48;
        c48 &= 0xFFFF;
        return fromBits((c16 << 16) | c00, (c48 << 16) | c32);
    };

    /**
    * Returns the difference of this and the given Long.
    * @param {Long} other Long to subtract from this.
    * @return {!Long} The difference of this and the given Long.
    */
    Long.prototype.subtract = function (other) {
        return this.add(other.negate());
    };

    /**
    * Returns the product of this and the given long.
    * @param {Long} other Long to multiply with this.
    * @return {!Long} The product of this and the other.
    */
    Long.prototype.multiply = function (other) {
        if (this.isZero() | other.isZero()) {
            return ZERO;
        }

        if (this.equals(MIN_VALUE)) {
            return other.isOdd() ? MIN_VALUE : ZERO;
        } else if (other.equals(MIN_VALUE)) {
            return this.isOdd() ? MIN_VALUE : ZERO;
        }

        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().multiply(other.negate());
            } else {
                return this.negate().multiply(other).negate();
            }
        } else if (other.isNegative()) {
            return this.multiply(other.negate()).negate();
        }

        // If both longs are small, use float multiplication
        if (this.lessThan(TWO_PWR_24_) && other.lessThan(TWO_PWR_24_)) {
            return fromNumber(this.toNumber() * other.toNumber());
        }

        // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
        // We can skip products that would overflow.
        var a48 = this.high_ >>> 16;
        var a32 = this.high_ & 0xFFFF;
        var a16 = this.low_ >>> 16;
        var a00 = this.low_ & 0xFFFF;

        var b48 = other.high_ >>> 16;
        var b32 = other.high_ & 0xFFFF;
        var b16 = other.low_ >>> 16;
        var b00 = other.low_ & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        return fromBits((c16 << 16) | c00, (c48 << 16) | c32);
    };

    /**
    * Returns this Long divided by the given one.
    * @param {Long} other Long by which to divide.
    * @return {!Long} This Long divided by the given one.
    */
    Long.prototype.div = function (other) {
        if (other.isZero()) {
            throw Error('division by zero');
        } else if (this.isZero()) {
            return ZERO;
        }

        if (this.equals(MIN_VALUE)) {
            if (other.equals(ONE) || other.equals(NEG_ONE)) {
                return MIN_VALUE;
            } else if (other.equals(MIN_VALUE)) {
                return ONE;
            } else {
                // At this point, we have |other| >= 2, so |this/other| < |MIN_VALUE|.
                var halfThis = this.shiftRight(1);
                var l_approx = halfThis.div(other).shiftLeft(1);
                if (l_approx.equals(ZERO)) {
                    return other.isNegative() ? ONE : NEG_ONE;
                } else {
                    var rem = this.subtract(other.multiply(l_approx));
                    var result = l_approx.add(rem.div(other));
                    return result;
                }
            }
        } else if (other.equals(MIN_VALUE)) {
            return ZERO;
        }

        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().div(other.negate());
            } else {
                return this.negate().div(other).negate();
            }
        } else if (other.isNegative()) {
            return this.div(other.negate()).negate();
        }

        // Repeat the following until the remainder is less than other:  find a
        // floating-point that approximates remainder / other *from below*, add this
        // into the result, and subtract it from the remainder.  It is critical that
        // the approximate value is less than or equal to the real value so that the
        // remainder never becomes negative.
        var res = ZERO;
        var rem = this;
        while (rem.greaterThanOrEqual(other)) {
            // Approximate the result of division. This may be a little greater or
            // smaller than the actual value.
            var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

            // We will tweak the approximate result by changing it in the 48-th digit or
            // the smallest non-fractional digit, whichever is larger.
            var log2 = Math.ceil(Math.log(approx) / Math.LN2);
            var delta = 1;
            if (log2 > 48)
                delta = Math.pow(2, log2 - 48);

            // Decrease the approximation until it is smaller than the remainder.  Note
            // that if it is too large, the product overflows and is negative.
            var approxRes = fromNumber(approx);
            var approxRem = approxRes.multiply(other);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = fromNumber(approx);
                approxRem = approxRes.multiply(other);
            }

            // We know the answer can't be zero... and actually, zero would cause
            // infinite recursion since we would make no progress.
            if (approxRes.isZero()) {
                approxRes = ONE;
            }

            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };

    /**
    * Returns this Long modulo the given one.
    * @param {Long} other Long by which to mod.
    * @return {!Long} This Long modulo the given one.
    */
    Long.prototype.modulo = function (other) {
        return this.subtract(this.div(other).multiply(other));
    };

    /** @return {!Long} The bitwise-NOT of this value. */
    Long.prototype.not = function () {
        return fromBits(~this.low_, ~this.high_);
    };

    /**
    * Returns the bitwise-AND of this Long and the given one.
    * @param {Long} other The Long with which to AND.
    * @return {!Long} The bitwise-AND of this and the other.
    */
    Long.prototype.and = function (other) {
        return fromBits(this.low_ & other.low_, this.high_ & other.high_);
    };

    /**
    * Returns the bitwise-OR of this Long and the given one.
    * @param {Long} other The Long with which to OR.
    * @return {!Long} The bitwise-OR of this and the other.
    */
    Long.prototype.or = function (other) {
        return fromBits(this.low_ | other.low_, this.high_ | other.high_);
    };

    /**
    * Returns the bitwise-XOR of this Long and the given one.
    * @param {Long} other The Long with which to XOR.
    * @return {!Long} The bitwise-XOR of this and the other.
    */
    Long.prototype.xor = function (other) {
        return fromBits(this.low_ ^ other.low_, this.high_ ^ other.high_);
    };

    /**
    * Returns this Long with bits shifted to the left by the given amount.
    * @param {number} numBits The number of bits by which to shift.
    * @return {!Long} This shifted to the left by the given amount.
    */
    Long.prototype.shiftLeft = function (numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var low = this.low_;
            if (numBits < 32) {
                var high = this.high_;
                return fromBits(low << numBits, (high << numBits) | (low >>> (32 - numBits)));
            } else {
                return fromBits(0, low << (numBits - 32));
            }
        }
    };

    /**
    * Returns this Long with bits shifted to the right by the given amount.
    * @param {number} numBits The number of bits by which to shift.
    * @return {!Long} This shifted to the right by the given amount.
    */
    Long.prototype.shiftRight = function (numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high_;
            if (numBits < 32) {
                var low = this.low_;
                return fromBits((low >>> numBits) | (high << (32 - numBits)), high >> numBits);
            } else {
                return fromBits(high >> (numBits - 32), high >= 0 ? 0 : -1);
            }
        }
    };

    /**
    * Returns this Long with bits shifted to the right by the given amount, with
    * the new top bits matching the current sign bit.
    * @param {number} numBits The number of bits by which to shift.
    * @return {!Long} This shifted to the right by the given amount, with
    *     zeros placed into the new leading bits.
    */
    Long.prototype.shiftRightUnsigned = function (numBits) {
        if (this === ZERO) {
            return this;
        }
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high_;
            if (numBits < 32) {
                var low = this.low_;
                return fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits);
            } else if (numBits == 32) {
                return fromBits(high, 0);
            } else {
                return fromBits(high >>> (numBits - 32), 0);
            }
        }
    };

    var ZERO = fromInt(0);
    var ONE = fromInt(1);
    var TWO = fromInt(2);
    var THREE = fromInt(3);
    var FOUR = fromInt(4);

    var NEG_ONE = fromInt(-1);
    var MAX_VALUE = fromBits(0xFFFFFFFF, 0x7FFFFFFF);
    var MIN_VALUE = fromBits(0, 0x80000000);

    var TWO_PWR_24_ = fromInt(TWO_PWR_24_DBL_);

    var TWO_PWR_16_DBL_ = 1 << 16;
    var TWO_PWR_24_DBL_ = 1 << 24;
    var TWO_PWR_32_DBL_ = TWO_PWR_16_DBL_ * TWO_PWR_16_DBL_;
    var TWO_PWR_31_DBL_ = TWO_PWR_32_DBL_ / 2;
    var TWO_PWR_48_DBL_ = TWO_PWR_32_DBL_ * TWO_PWR_16_DBL_;
    var TWO_PWR_64_DBL_ = TWO_PWR_32_DBL_ * TWO_PWR_32_DBL_;
    var TWO_PWR_63_DBL_ = TWO_PWR_64_DBL_ / 2;

    exports.ZERO = ZERO;
    exports.ONE = ONE;

    exports.fromInt = fromInt;
    exports.fromNumber = fromNumber;
    exports.fromBits = fromBits;
    exports.fromString = fromString;
    exports.constructor = Long;
})(typeof exports === "undefined" ? this.Long = {} : exports);
