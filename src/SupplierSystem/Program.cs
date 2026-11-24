using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SupplierSystem.Data;
using SupplierSystem.Endpoints;
using SupplierSystem.Services;

var builder = WebApplication.CreateBuilder(args);

var dataDir = Path.Combine(builder.Environment.ContentRootPath, "App_Data");
Directory.CreateDirectory(dataDir);
var conn = builder.Configuration.GetConnectionString("Default") ?? $"Data Source={Path.Combine(dataDir, "suppliers-v6.db")}";

builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(conn));
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<ClassificationService>();
builder.Services.AddScoped<EligibilityEngine>();
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c => c.SwaggerDoc("v1", new() { Title = "Supplier Management API", Version = "v2" }));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
    await SeedData.EnsureSeededAsync(db, scope.ServiceProvider.GetRequiredService<AuditService>(), Path.Combine(dataDir, "uploads"));
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapApi();
app.MapFallbackToFile("index.html");

app.Run();
