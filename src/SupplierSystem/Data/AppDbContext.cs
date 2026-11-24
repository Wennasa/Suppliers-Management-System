using Microsoft.EntityFrameworkCore;
using SupplierSystem.Models;

namespace SupplierSystem.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SupplierDocument> Documents => Set<SupplierDocument>();
    public DbSet<Tender> Tenders => Set<Tender>();
    public DbSet<TenderInvitation> TenderInvitations => Set<TenderInvitation>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<SystemSettings> Settings => Set<SystemSettings>();
    public DbSet<AppUser> Users => Set<AppUser>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AppUser>().HasIndex(u => u.Email).IsUnique();
        b.Entity<AppUser>().HasIndex(u => u.EmployeeNo).IsUnique();
        // SQLite لا يدعم decimal أصلاً؛ نخزنه كنص للحفاظ على الدقة ونرتب في الذاكرة.
        b.Entity<Supplier>(e =>
        {
            e.HasIndex(x => x.Code).IsUnique();
            e.HasIndex(x => x.CommercialRegNo).IsUnique();
            e.HasIndex(x => x.MainActivity);
            e.Property(x => x.Status).HasConversion<string>();
            e.Property(x => x.FinancialApproval).HasConversion<string>();
            e.Property(x => x.LegalApproval).HasConversion<string>();
            e.Property(x => x.ActivationApproval).HasConversion<string>();
            e.HasMany(x => x.Documents).WithOne().HasForeignKey(d => d.SupplierId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<SupplierDocument>().Property(x => x.Type).HasConversion<string>();
        b.Entity<Tender>(e =>
        {
            e.HasIndex(x => x.RefNo).IsUnique();
            e.HasMany(x => x.Invitations).WithOne().HasForeignKey(i => i.TenderId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<TenderInvitation>().HasIndex(x => new { x.TenderId, x.SupplierId }).IsUnique();
        b.Entity<AuditLog>().HasIndex(x => x.Timestamp);
    }
}
