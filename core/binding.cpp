#include <pybind11/pybind11.h>
#include "pii_masker.hpp"

namespace py = pybind11;

PYBIND11_MODULE(pii_masker, m) {
    m.doc() = "JurisFlow PII Masker Module";

    m.def("mask_pii", &mask_pii, "Mask PII in the given input text and return the masked text.");
}