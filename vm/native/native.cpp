//#define GC_DEBUG

#include "gc.h"
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <inttypes.h>
#include <emscripten.h>

// Formatting: Printing longs.
// printf("L: %" PRId64 ", R: %" PRId64, *l, *r);

extern "C" {
	void lAdd(int64_t *result, int64_t *l, int64_t *r) {
		*result = *l + *r;
	}
	void lNeg(int64_t *result, int64_t *l) {
    *result = -*l;
  }
	void lSub(int64_t *result, int64_t *l, int64_t *r) {
    *result = *l - *r;
  }
  void lDiv(int64_t *result, int64_t *l, int64_t *r) {
    *result = *l / *r;
  }
  void lMul(int64_t *result, int64_t *l, int64_t *r) {
    *result = *l * *r;
  }
  void lRem(int64_t *result, int64_t *l, int64_t *r) {
    *result = *l % *r;
  }
  void lShl(int64_t *result, int64_t *l, int32_t v) {
		*result = *l << (v & 0x3F);
	}
	void lShr(int64_t *result, int64_t *l, int32_t v) {
  	*result = *l >> (v & 0x3F);
  }
  void lUshr(int64_t *result, int64_t *l, int32_t v) {
  	*result = (uint64_t)*l >> (v & 0x3F);
  }
  void lCmp(int32_t *result, int64_t *l, int64_t *r) {
    if (*l > *r) {
      *result = 1;
    } else if (*l < *r) {
      *result = -1;
    } else {
      *result = 0;
    }
  }

  void GC_CALLBACK finalizer(void* obj, void* client_data) {
    EM_ASM_INT({
      J2ME.onFinalize($0);
    }, (int)obj);
  }

  uintptr_t gcMallocUncollectable(int32_t size) {
    uintptr_t p = (uintptr_t)GC_MALLOC_UNCOLLECTABLE(size);
    GC_REGISTER_FINALIZER((void*)p, finalizer, NULL, (GC_finalization_proc*)0, (void**)0);
    return p;
  }

  void gcFree(uintptr_t p) {
    GC_FREE((void*)p);
  }

  uintptr_t gcMalloc(int32_t size) {
    uintptr_t p = (uintptr_t)GC_MALLOC(size);
    GC_REGISTER_FINALIZER((void*)p, finalizer, NULL, (GC_finalization_proc*)0, (void**)0);
    return p;
  }

  uintptr_t gcMallocAtomic(int32_t size) {
    uintptr_t p = (uintptr_t)GC_MALLOC_ATOMIC(size);
    GC_REGISTER_FINALIZER((void*)p, finalizer, NULL, (GC_finalization_proc*)0, (void**)0);
    return p;
  }

  void forceCollection(void) {
    GC_gcollect();
  }
}

int main() {
  GC_INIT();
  GC_set_max_heap_size(128 * 1024 * 1024);
}