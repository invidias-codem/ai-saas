terraform {
  required_version = "= 1.16.7"

  backend "gcs" {}
}

resource "terraform_data" "marker" {
  input = "lattice-iac-sandbox-state-qualification"
}
